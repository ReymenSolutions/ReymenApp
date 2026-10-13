// ─── REYMEN Loyalty ↔ Reymen POS ──────────────────────────────────────
// Solo servidor. El POS identifica al cliente en caja (QR de su tarjeta o su
// WhatsApp) y, al cerrar la venta, la manda por el webhook de órdenes de
// siempre (/api/webhooks/pos/orders) con un bloque `loyalty`. Aquí:
//
//  - lookupMemberForPos: lo que el POS muestra antes de cobrar (progreso y
//    recompensas disponibles), sin datos de contacto completos.
//  - applyPosOrderLoyalty: dentro de la MISMA transacción que crea la venta,
//    registra la visita ligada a esa FoodSale (monto real del ticket, sucursal
//    y orden), desbloquea la recompensa al llegar a la meta y canjea la que el
//    POS aplicó. La llave de idempotencia es la orden del POS: un reenvío no
//    cuenta doble. Si la venta se cancela, la visita queda ANULADA (no se
//    borra) y el progreso se corrige cuando es seguro hacerlo.
//
// Lealtad nunca tumba una venta: si algo de lealtad no aplica (cliente no
// inscrito, programa en pausa, visita repetida) la venta se guarda igual y la
// respuesta dice por qué no contó.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/phone";
import { normalizePhoneMx } from "@/lib/customers";
import { hasModule } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { progressOf, type Progress } from "./cycle";
import { extractMemberToken, firstName, maskPhone } from "./token";
import { getActiveProgram, LoyaltyRuleError, MAX_SALE_AMOUNT, registerVisitInTx } from "./service";

type Db = Prisma.TransactionClient | typeof prisma;

/** Bloque `loyalty` que el POS manda en la orden o en la consulta. */
export interface PosLoyaltyRequest {
  /** Contenido del QR de la tarjeta (URL completa) o el token solo. */
  code?: string;
  /** WhatsApp del cliente, si el cajero lo busca por teléfono. */
  phone?: string;
  /** Recompensa que el POS aplicó como descuento en esta orden. */
  redeemRewardId?: string;
}

export function parsePosLoyalty(raw: unknown): PosLoyaltyRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const req: PosLoyaltyRequest = { code: str(r.code, 300), phone: str(r.phone, 30), redeemRewardId: str(r.redeemRewardId, 40) };
  return req.code || req.phone || req.redeemRewardId ? req : null;
}

/** Miembro del programa por QR/token o, si no hay, por WhatsApp. Solo de esta organización. */
async function findMember(db: Db, organizationId: string, programId: string, req: PosLoyaltyRequest) {
  const token = req.code ? extractMemberToken(req.code) : null;
  if (token) {
    return db.loyaltyMember.findFirst({ where: { organizationId, programId, publicToken: token }, select: { id: true } });
  }
  const phone = req.phone ? normalizePhoneMx(req.phone) : null;
  const key = phone ? phoneKey(phone) : null;
  if (key) {
    return db.loyaltyMember.findFirst({ where: { organizationId, programId, whatsappKey: key }, select: { id: true } });
  }
  return null;
}

export interface PosMemberView {
  memberId: string;
  /** Solo el primer nombre y el teléfono enmascarado: lo que el cajero necesita para confirmar. */
  firstName: string;
  maskedPhone: string;
  progress: Progress;
  rewardsAvailable: { id: string; name: string; description: string | null }[];
}

export type PosLookupResult =
  | { status: "found"; program: { name: string; rewardName: string; visitGoal: number }; member: PosMemberView }
  | { status: "not_enrolled" | "no_program" | "program_paused" | "invalid_request" };

async function memberView(db: Db, memberId: string, goal: number): Promise<PosMemberView> {
  const m = await db.loyaltyMember.findUniqueOrThrow({
    where: { id: memberId },
    select: {
      id: true,
      name: true,
      whatsapp: true,
      cycleVisits: true,
      rewards: { where: { status: "AVAILABLE" }, orderBy: { earnedAt: "asc" }, select: { id: true, rewardName: true, rewardDescription: true } },
    },
  });
  return {
    memberId: m.id,
    firstName: firstName(m.name),
    maskedPhone: maskPhone(m.whatsapp),
    progress: progressOf(m.cycleVisits, goal),
    rewardsAvailable: m.rewards.map((r) => ({ id: r.id, name: r.rewardName, description: r.rewardDescription })),
  };
}

/** Consulta de caja: ¿quién es y cómo va? No registra nada. */
export async function lookupMemberForPos(organizationId: string, req: PosLoyaltyRequest | null): Promise<PosLookupResult> {
  if (!req || (!req.code && !req.phone)) return { status: "invalid_request" };
  const program = await getActiveProgram(organizationId);
  if (!program) return { status: "no_program" };
  if (program.status !== "ACTIVE") return { status: "program_paused" };
  const found = await findMember(prisma, organizationId, program.id, req);
  if (!found) return { status: "not_enrolled" };
  return {
    status: "found",
    program: { name: program.name, rewardName: program.rule.rewardName, visitGoal: program.rule.visitGoal },
    member: await memberView(prisma, found.id, program.rule.visitGoal),
  };
}

export type PosLoyaltyResult =
  | {
      status: "visit_registered" | "already_registered";
      member: PosMemberView;
      rewardUnlocked: { id: string; name: string } | null;
      redeemed: { id: string; name: string } | null;
      redeemError: "reward_not_available" | null;
    }
  | { status: "not_counted"; reason: "not_enrolled" | "no_program" | "program_paused" | "branch_not_in_program" | "cooldown" | "amount_out_of_range" }
  | { status: "visit_voided"; rewardVoided: boolean; needsReview: boolean };

/** Hechos de la venta que el POS acaba de crear (dentro de su transacción). */
export interface PosSaleFacts {
  organizationId: string;
  saleId: string;
  externalOrderId: string | null;
  branchId: string | null;
  grossAmount: number;
  occurredAt: Date;
  /** Venta original cuando esta orden es una cancelación (grossAmount < 0). */
  cancelsSaleId: string | null;
}

/** ¿Hay algo de Lealtad que hacer con esta orden? (Se consulta FUERA de la transacción de la venta.) */
export async function posLoyaltyEnabled(organizationId: string): Promise<boolean> {
  return hasModule(organizationId, "LOYALTY");
}

/**
 * Aplica la orden del POS a Lealtad dentro de la transacción de la venta.
 * Devuelve null si la orden no toca Lealtad.
 */
export async function applyPosOrderLoyalty(
  tx: Prisma.TransactionClient,
  sale: PosSaleFacts,
  req: PosLoyaltyRequest | null
): Promise<PosLoyaltyResult | null> {
  if (sale.cancelsSaleId) return voidVisitForCancelledSale(tx, sale);
  if (!req) return null;
  if (sale.grossAmount <= 0) return null;

  const program = await tx.loyaltyProgram.findFirst({ where: { organizationId: sale.organizationId }, orderBy: { createdAt: "desc" } });
  if (!program) return { status: "not_counted", reason: "no_program" };
  if (program.status !== "ACTIVE") return { status: "not_counted", reason: "program_paused" };
  const rule = await tx.loyaltyProgramVersion.findUniqueOrThrow({ where: { programId_version: { programId: program.id, version: program.currentVersion } } });

  const found = await findMember(tx, sale.organizationId, program.id, req);
  if (!found) return { status: "not_counted", reason: "not_enrolled" };
  if (sale.grossAmount > MAX_SALE_AMOUNT) return { status: "not_counted", reason: "amount_out_of_range" };

  let visit;
  try {
    visit = await registerVisitInTx(
      tx,
      {
        organizationId: sale.organizationId,
        employeeUserId: null,
        memberId: found.id,
        branchId: sale.branchId,
        saleAmount: Math.round(sale.grossAmount * 100) / 100,
        saleId: sale.saleId,
        // La orden del POS es la llave: reenviarla nunca cuenta una segunda visita.
        idempotencyKey: `pos:${sale.externalOrderId ?? sale.saleId}`.slice(0, 80),
      },
      sale.occurredAt
    );
  } catch (err) {
    // Las reglas se revisan antes de escribir: la venta sigue intacta.
    if (err instanceof LoyaltyRuleError && (err.code === "program_paused" || err.code === "branch_not_in_program" || err.code === "cooldown")) {
      return { status: "not_counted", reason: err.code };
    }
    if (err instanceof LoyaltyRuleError && err.code === "member_not_found") return { status: "not_counted", reason: "not_enrolled" };
    throw err;
  }

  // Canje de la recompensa que el POS aplicó: atómico y solo del mismo cliente.
  let redeemed: { id: string; name: string } | null = null;
  let redeemError: "reward_not_available" | null = null;
  if (req.redeemRewardId) {
    const res = await tx.loyaltyReward.updateMany({
      where: { id: req.redeemRewardId, organizationId: sale.organizationId, memberId: found.id, status: "AVAILABLE" },
      data: { status: "REDEEMED", redeemedAt: sale.occurredAt, redeemedBranchId: sale.branchId, redeemedById: null },
    });
    if (res.count === 1) {
      const r = await tx.loyaltyReward.findUniqueOrThrow({ where: { id: req.redeemRewardId }, select: { id: true, rewardName: true } });
      redeemed = { id: r.id, name: r.rewardName };
    } else {
      redeemError = "reward_not_available";
    }
  }

  return {
    status: visit.replay ? "already_registered" : "visit_registered",
    member: await memberView(tx, found.id, rule.visitGoal),
    rewardUnlocked: visit.reward ? { id: visit.reward.id, name: visit.reward.rewardName } : null,
    redeemed,
    redeemError,
  };
}

/**
 * La venta original se canceló en el POS: su visita queda ANULADA (nunca se
 * borra) y deja de contar en totales y analítica. El progreso se corrige
 * solo cuando es seguro:
 *  - la visita es del ciclo en curso → una visita menos en el ciclo;
 *  - la visita completó el ciclo y la recompensa sigue disponible y no hubo
 *    visitas después → la recompensa se anula y el cliente queda a una visita
 *    de la meta (en un ciclo nuevo, para no chocar con la anulada);
 *  - cualquier otro caso (recompensa ya canjeada, visitas posteriores) → solo
 *    se anula la visita y se marca para revisión en la bitácora.
 */
async function voidVisitForCancelledSale(tx: Prisma.TransactionClient, sale: PosSaleFacts): Promise<PosLoyaltyResult | null> {
  const visit = await tx.loyaltyVisit.findFirst({
    where: { organizationId: sale.organizationId, saleId: sale.cancelsSaleId!, status: "CONFIRMED" },
    include: { earnedReward: { select: { id: true, status: true } } },
  });
  if (!visit) return null;
  await tx.$queryRaw`SELECT "id" FROM "LoyaltyMember" WHERE "id" = ${visit.memberId} FOR UPDATE`;
  const member = await tx.loyaltyMember.findUniqueOrThrow({ where: { id: visit.memberId } });
  const rule = await tx.loyaltyProgramVersion.findUniqueOrThrow({ where: { programId_version: { programId: visit.programId, version: visit.programVersion } } });

  await tx.loyaltyVisit.update({ where: { id: visit.id }, data: { status: "VOIDED" } });
  const amount = visit.saleAmount === null ? null : Number(visit.saleAmount);
  const totals = {
    totalVisits: { decrement: 1 },
    ...(amount !== null ? { visitsWithAmount: { decrement: 1 }, totalSpent: { decrement: amount } } : {}),
  };

  let rewardVoided = false;
  let needsReview = false;
  let progressUpdate: Prisma.LoyaltyMemberUpdateInput = {};
  if (!visit.earnedReward) {
    if (visit.cycleNumber === member.cycleNumber && member.cycleVisits > 0) progressUpdate = { cycleVisits: member.cycleVisits - 1 };
    else needsReview = true;
  } else if (visit.earnedReward.status === "AVAILABLE" && member.cycleNumber === visit.cycleNumber + 1 && member.cycleVisits === 0) {
    await tx.loyaltyReward.update({ where: { id: visit.earnedReward.id }, data: { status: "VOIDED" } });
    rewardVoided = true;
    // Queda a una visita de la meta, en un ciclo nuevo (el anulado conserva su número).
    progressUpdate = { cycleNumber: member.cycleNumber + 1, cycleVisits: Math.max(0, rule.visitGoal - 1) };
  } else {
    needsReview = true;
  }
  await tx.loyaltyMember.update({ where: { id: member.id }, data: { ...totals, ...progressUpdate } });
  return { status: "visit_voided", rewardVoided, needsReview };
}

/** Bitácora después de confirmar la transacción de la venta. */
export async function auditPosLoyalty(organizationId: string, saleId: string, result: PosLoyaltyResult | null) {
  if (!result || result.status === "not_counted" || result.status === "already_registered") return;
  if (result.status === "visit_voided") {
    await logAudit({
      organizationId,
      userId: null,
      action: "loyalty.visit_void",
      resource: "FoodSale",
      resourceId: saleId,
      metadata: { source: "pos", rewardVoided: result.rewardVoided, needsReview: result.needsReview },
    });
    return;
  }
  await logAudit({
    organizationId,
    userId: null,
    action: "loyalty.visit_register",
    resource: "FoodSale",
    resourceId: saleId,
    metadata: { source: "pos", memberId: result.member.memberId, rewardUnlocked: result.rewardUnlocked?.id ?? null, redeemed: result.redeemed?.id ?? null },
  });
}
