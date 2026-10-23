// Operaciones de escritura de REYMEN Loyalty (solo servidor). Las acciones de
// servidor (src/actions/loyalty*.ts) validan sesión, permisos y formato y
// luego llaman aquí; el seed de demo y las pruebas usan estas mismas funciones.
//
// Aislamiento por organización: cada función recibe el organizationId del
// lado del servidor (de la sesión, o resuelto desde el slug público) y TODA
// consulta lo incluye en el where. Un id o token de otra organización
// simplemente "no existe".

import { emitDomainEvent } from "@/lib/domain-events";
import { reconcileMemberInTx } from "./reconcile";
import { randomBytes } from "crypto";
import { Prisma, type LoyaltyRewardType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";
import { phoneKey } from "@/lib/phone";
import { normalizePhoneMx, upsertCustomer } from "@/lib/customers";
import { hasModule } from "@/lib/modules";
import { applyVisit, normalizeGoal, progressOf, type Progress } from "./cycle";
import { normalizePostalCode } from "./postal-zones";

/** Versión del texto de consentimiento que acepta el cliente al inscribirse. */
export const CONSENT_TEXT_VERSION = "loyalty-enroll-v2";
/** Dos visitas del mismo cliente con menos de esto se consideran duplicado accidental. */
export const VISIT_COOLDOWN_MINUTES = 3;
/** Tope de un monto de venta capturado en caja (protege de un dedo de más). */
export const MAX_SALE_AMOUNT = 100_000;

export function generateMemberToken(): string {
  return randomBytes(18).toString("base64url");
}

// ─── Programa ───────────────────────────────────────────────────────────

export async function getActiveProgram(organizationId: string, programId?: string) {
  const program = await prisma.loyaltyProgram.findFirst({
    where: { organizationId, ...(programId ? { id: programId } : {}) },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    include: { branch: { select: { id: true, name: true } } },
  });
  if (!program) return null;
  const rule = await prisma.loyaltyProgramVersion.findUnique({
    where: { programId_version: { programId: program.id, version: program.currentVersion } },
  });
  if (!rule) return null;
  return { ...program, rule };
}

export type LoyaltyProgramWithRule = NonNullable<Awaited<ReturnType<typeof getActiveProgram>>>;

export interface ProgramInput {
  programId?: string;
  createNew?: boolean;
  rewardValue?: number | null;
  name: string;
  description: string | null;
  status: "ACTIVE" | "PAUSED";
  visitGoal: number;
  rewardType: LoyaltyRewardType;
  rewardName: string;
  rewardDescription: string | null;
  rewardHeadline: string | null;
  scope: "ORGANIZATION" | "BRANCH";
  branchId: string | null;
  /** Diseño de la tarjeta (no crea versión nueva de la regla). */
  cardColor?: string | null;
  cardAccent?: string | null;
  cardIcon?: string | null;
}

/**
 * Crea el programa (versión 1) o lo actualiza. Nombre, descripción y estado se
 * editan en el lugar; cambiar la regla (meta o recompensa) crea una versión
 * nueva — las recompensas ya emitidas conservan la suya y el progreso de los
 * clientes no se recalcula hacia atrás.
 */
export async function saveProgram(organizationId: string, userId: string | null, input: ProgramInput) {
  const visitGoal = normalizeGoal(input.visitGoal);
  if (input.rewardValue != null && (!Number.isFinite(input.rewardValue) || input.rewardValue <= 0 || (input.rewardType === "DISCOUNT_PERCENT" ? input.rewardValue > 100 : input.rewardType === "DISCOUNT_AMOUNT" ? input.rewardValue > MAX_SALE_AMOUNT : true))) throw new UserError("Revisa el valor de la recompensa.");
  if (input.scope === "BRANCH") {
    if (!input.branchId) throw new UserError("Elige la sucursal del programa.");
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, organizationId }, select: { id: true } });
    if (!branch) throw new UserError("Esa sucursal no existe.");
  }
  const branchId = input.scope === "BRANCH" ? input.branchId : null;

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`;
    const current = input.createNew ? null : await tx.loyaltyProgram.findFirst({ where: { organizationId, ...(input.programId ? { id: input.programId } : {}) }, orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }] });
    if (input.programId && !current) throw new UserError("Programa no encontrado.");
    const hasProgram = await tx.loyaltyProgram.count({ where: { organizationId } });
    const existing = current ? { ...current, rule: await tx.loyaltyProgramVersion.findUniqueOrThrow({ where: { programId_version: { programId: current.id, version: current.currentVersion } } }) } : null;
    if (!existing) {
      const program = await tx.loyaltyProgram.create({
        data: {
          organizationId,
          isPrimary: hasProgram === 0,
          name: input.name,
          description: input.description,
          status: input.status,
          scope: input.scope,
          branchId,
          cardColor: input.cardColor ?? null,
          cardAccent: input.cardAccent ?? null,
          cardIcon: input.cardIcon ?? null,
          currentVersion: 1,
          versions: {
            create: {
              organizationId,
              version: 1,
              visitGoal,
              rewardType: input.rewardType,
              rewardValue: input.rewardValue ?? null,
              rewardName: input.rewardName,
              rewardDescription: input.rewardDescription,
              rewardHeadline: input.rewardHeadline,
              createdById: userId,
            },
          },
        },
      });
      return { programId: program.id, version: 1, created: true, ruleChanged: true };
    }

    const r = existing.rule;
    const ruleChanged =
      r.visitGoal !== visitGoal ||
      r.rewardType !== input.rewardType ||
      Number(r.rewardValue ?? 0) !== Number(input.rewardValue ?? 0) ||
      r.rewardName !== input.rewardName ||
      (r.rewardDescription ?? null) !== input.rewardDescription ||
      (r.rewardHeadline ?? null) !== input.rewardHeadline;
    const version = ruleChanged ? existing.currentVersion + 1 : existing.currentVersion;
    if (ruleChanged) {
      await tx.loyaltyProgramVersion.create({
        data: {
          organizationId,
          programId: existing.id,
          version,
          visitGoal,
          rewardType: input.rewardType,
          rewardValue: input.rewardValue ?? null,
          rewardName: input.rewardName,
          rewardDescription: input.rewardDescription,
          rewardHeadline: input.rewardHeadline,
          createdById: userId,
        },
      });
    }
    await tx.loyaltyProgram.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        description: input.description,
        status: input.status,
        scope: input.scope,
        branchId,
        currentVersion: version,
        ...(input.cardColor !== undefined ? { cardColor: input.cardColor } : {}),
        ...(input.cardAccent !== undefined ? { cardAccent: input.cardAccent } : {}),
        ...(input.cardIcon !== undefined ? { cardIcon: input.cardIcon } : {}),
      },
    });
    return { programId: existing.id, version, created: false, ruleChanged };
  });

  await logAudit({
    organizationId,
    userId,
    action: result.created ? "loyalty.program_create" : "loyalty.program_update",
    resource: "LoyaltyProgram",
    resourceId: result.programId,
    metadata: { version: result.version, ruleChanged: result.ruleChanged, visitGoal, rewardName: input.rewardName, status: input.status },
  });
  return result;
}

// ─── Inscripción pública ────────────────────────────────────────────────

export interface EnrollInput {
  programId?: string;
  name: string;
  whatsapp: string;
  postalCode: string;
  email: string | null;
  /** Parámetro ?suc= de la URL; se ignora si no es una sucursal activa del negocio. */
  branchId: string | null;
  consent: boolean;
}

export type EnrollResult = { status: "created"; token: string } | { status: "already_enrolled" };

/** Negocio + programa que atienden la página pública /lealtad/<slug>. Null si no aplica. */
export async function resolvePublicProgram(orgSlug: string, programId?: string) {
  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true, name: true, slug: true, logoUrl: true, isActive: true },
  });
  if (!org || !org.isActive) return null;
  if (!(await hasModule(org.id, "LOYALTY"))) return null;
  const program = await getActiveProgram(org.id, programId);
  if (!program) return null;
  return { org, program };
}

export async function enrollMember(orgSlug: string, input: EnrollInput, now: Date = new Date()): Promise<EnrollResult> {
  const resolved = await resolvePublicProgram(orgSlug, input.programId);
  if (!resolved) throw new UserError("Este programa de lealtad no está disponible.");
  const { org, program } = resolved;
  if (program.status !== "ACTIVE") throw new UserError("El programa de lealtad está en pausa por ahora.");
  if (!input.consent) throw new UserError("Para inscribirte acepta el uso de tus datos para el programa.");

  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 80) throw new UserError("Escribe tu nombre.");
  const whatsapp = normalizePhoneMx(input.whatsapp);
  const key = whatsapp ? phoneKey(whatsapp) : null;
  if (!whatsapp || !key) throw new UserError("Revisa tu número de WhatsApp (10 dígitos).");
  const postalCode = normalizePostalCode(input.postalCode);
  if (!postalCode) throw new UserError("El código postal debe tener 5 dígitos.");
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("Revisa tu correo.");

  let branchId: string | null = null;
  if (input.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, organizationId: org.id, isActive: true }, select: { id: true } });
    branchId = branch?.id ?? null;
  }
  if (program.scope === "BRANCH") branchId = program.branchId;

  // Ya inscrito: no se devuelve su tarjeta. Si se devolviera, cualquiera que
  // escribiera el número de otra persona obtendría su tarjeta.
  const already = await prisma.loyaltyMember.findFirst({
    where: { organizationId: org.id, whatsappKey: key },
    select: { id: true },
  });
  if (already) return { status: "already_enrolled" };

  try {
    const member = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { organizationId_phoneKey: { organizationId: org.id, phoneKey: key } } }) ?? await upsertCustomer(tx, org.id, { phone: whatsapp, name });
      return tx.loyaltyMember.create({
        data: {
          organizationId: org.id,
          programId: program.id,
          customerId: customer.id,
          name,
          whatsapp,
          whatsappKey: key,
          postalCode,
          email,
          enrollmentBranchId: branchId,
          publicToken: generateMemberToken(),
          consentTextVersion: CONSENT_TEXT_VERSION,
          consentAt: now,
          createdAt: now,
        },
        select: { id: true, publicToken: true },
      });
    });
    await logAudit({
      organizationId: org.id,
      action: "loyalty.member_enroll",
      resource: "LoyaltyMember",
      resourceId: member.id,
      metadata: { postalCode, branchId },
    });
    return { status: "created", token: member.publicToken };
  } catch (err) {
    // Dos envíos simultáneos del mismo número: el segundo choca con el único.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { status: "already_enrolled" };
    throw err;
  }
}

/** Datos mínimos para la tarjeta pública. Sin WhatsApp, correo ni ids internos. */
export async function getPublicCard(orgSlug: string, token: string) {
  const resolved = await resolvePublicProgram(orgSlug);
  if (!resolved) return null;
  const member = await prisma.loyaltyMember.findFirst({
    where: { publicToken: token, organizationId: resolved.org.id },
    select: {
      programId: true, isSelected: true,
      name: true,
      cycleVisits: true,
      deficitVisits: true,
      cycleNumber: true,
      totalVisits: true,
      createdAt: true,
      rewards: {
        where: { status: "AVAILABLE" },
        orderBy: { earnedAt: "asc" },
        select: { rewardName: true, rewardDescription: true, earnedAt: true },
      },
      _count: { select: { rewards: { where: { status: "REDEEMED" } } } },
    },
  });
  if (!member) return null;
  const program = await getActiveProgram(resolved.org.id, member.programId);
  if (!program) return null;
  return {
    org: resolved.org,
    program,
    member: {
      isSelected: member.isSelected,
      name: member.name.split(/\s+/)[0],
      deficitVisits: member.deficitVisits,
      cycleVisits: member.cycleVisits,
      cycleNumber: member.cycleNumber,
      totalVisits: member.totalVisits,
      createdAt: member.createdAt,
      availableRewards: member.rewards,
      redeemedCount: member._count.rewards,
    },
  };
}

// ─── Caja: registrar visita ─────────────────────────────────────────────

/**
 * Regla de Lealtad que impide registrar la visita (programa en pausa, cliente
 * de otra sucursal, visita repetida). Es un UserError (llega al usuario tal
 * cual) con un código estable para que el POS sepa qué pasó.
 */
export class LoyaltyRuleError extends UserError {
  constructor(
    public code: "member_not_found" | "program_paused" | "branch_not_in_program" | "cooldown" | "invalid_request",
    message: string
  ) {
    super(message);
  }
}

export interface RegisterVisitInput {
  organizationId: string;
  /** Quién confirmó la visita; null = la registró el POS con su propia orden. */
  employeeUserId: string | null;
  memberId: string;
  /** null = sucursal principal. */
  branchId: string | null;
  saleAmount: number | null;
  /** Generada por la pantalla de caja al abrir el formulario; un reenvío con la misma llave no duplica. */
  idempotencyKey: string;
  saleId?: string | null;
  /** Internal server-derived sale policy; never read from POS customer input. */
  posCooldownMinutes?: number;
  now?: Date;
}

export interface RegisterVisitResult {
  visitId: string;
  replay: boolean;
  progress: Progress;
  cycleNumber: number;
  reward: { id: string; rewardName: string } | null;
  totalVisits: number;
}

/**
 * Registra una visita confirmada por el negocio. Todo en una transacción con
 * el renglón del miembro bloqueado (FOR UPDATE): la visita, el avance del
 * ciclo, la recompensa (si se completa) y los totales quedan juntos o no
 * quedan. Una recompensa por ciclo (único memberId+cycleNumber) y una visita
 * por llave de idempotencia (único organizationId+idempotencyKey).
 */
export async function registerVisit(input: RegisterVisitInput): Promise<RegisterVisitResult> {
  const now = input.now ?? new Date();
  const { organizationId } = input;
  if (!input.idempotencyKey || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 80) {
    throw new UserError("Solicitud inválida. Recarga la página.");
  }
  if (input.saleAmount !== null) {
    if (!Number.isFinite(input.saleAmount) || input.saleAmount <= 0 || input.saleAmount > MAX_SALE_AMOUNT) {
      throw new UserError("Revisa el monto de la venta.");
    }
  }
  const saleAmount = input.saleAmount === null ? null : Math.round(input.saleAmount * 100) / 100;

  if (input.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, organizationId }, select: { id: true, isActive: true } });
    if (!branch || !branch.isActive) throw new UserError("Esa sucursal no existe.");
  }
  if (input.saleId) {
    const sale = await prisma.foodSale.findFirst({ where: { id: input.saleId, organizationId }, select: { id: true } });
    if (!sale) throw new UserError("Venta no encontrada");
  }

  const result = await prisma.$transaction(async (tx) => {
    const original = await tx.loyaltyMember.findFirst({ where: { id: input.memberId, organizationId } });
    if (!original) throw new UserError("Cliente no encontrado.");
    if (original.customerId) await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${original.customerId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const selected = original.customerId ? await tx.loyaltyMember.findFirst({ where: { organizationId, customerId: original.customerId, isSelected: true } }) : original;
    if (!selected) throw new UserError("El cliente debe elegir un programa.");
    return registerVisitInTx(tx, { ...input, memberId: selected.id, saleAmount }, now);
  });

  if (!result.replay) {
    await logAudit({
      organizationId,
      userId: input.employeeUserId,
      action: "loyalty.visit_register",
      resource: "LoyaltyVisit",
      resourceId: result.visitId,
      metadata: { memberId: input.memberId, branchId: input.branchId, saleAmount, rewardId: result.reward?.id ?? null },
    });
    if (result.reward) {
      await logAudit({
        organizationId,
        userId: input.employeeUserId,
        action: "loyalty.reward_earned",
        resource: "LoyaltyReward",
        resourceId: result.reward.id,
        metadata: { memberId: input.memberId, visitId: result.visitId },
      });
    }
  }
  return result;
}

// ─── Caja: canjear recompensa ───────────────────────────────────────────

export async function redeemReward(input: { organizationId: string; userId?: string; rewardId: string; branchId: string | null; now?: Date; pos?: { requestId: string; deviceId: string; employeeId: string; customerId: string } }) {
  if (!input.userId && !input.pos) throw new UserError("Sin permisos");
  const now = input.now ?? new Date();
  if (input.branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: input.branchId, organizationId: input.organizationId }, select: { id: true } });
    if (!branch) throw new UserError("Esa sucursal no existe.");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.loyaltyReward.findFirst({ where: { id: input.rewardId, organizationId: input.organizationId } });
    if (!existing) throw new UserError("Recompensa no encontrada.");
    await tx.$queryRaw`SELECT id FROM "LoyaltyMember" WHERE id = ${existing.memberId} AND "organizationId" = ${input.organizationId} FOR UPDATE`;
    const member = await tx.loyaltyMember.findFirstOrThrow({ where: { id: existing.memberId, organizationId: input.organizationId } });
    if (input.pos) {
      if (member.customerId !== input.pos.customerId) throw new UserError("Recompensa no encontrada.");
      const prior = await tx.domainEvent.findUnique({ where: { organizationId_dedupeKey: { organizationId: input.organizationId, dedupeKey: `loyalty.reward_redeemed:${existing.id}` } } });
      const payload = prior?.payload as Record<string, unknown> | undefined;
      if (payload?.posRequestId === input.pos.requestId && payload?.deviceId === input.pos.deviceId && payload?.employeeId === input.pos.employeeId) return existing;
      if ((existing.rewardType === "DISCOUNT_AMOUNT" || existing.rewardType === "DISCOUNT_PERCENT") && Number(existing.rewardValue) > 0) throw new UserError("Aplica esta recompensa como descuento al cobrar.");
    }
    const program = await tx.loyaltyProgram.findFirstOrThrow({ where: { id: member.programId, organizationId: input.organizationId } });
    if (program.status !== "ACTIVE") throw new UserError("El programa de lealtad está en pausa.");
    if (program.scope === "BRANCH" && program.branchId !== input.branchId) throw new UserError("Esta recompensa solo se canjea en la sucursal del programa.");
    const res = await tx.loyaltyReward.updateMany({
      where: { id: input.rewardId, organizationId: input.organizationId, status: "AVAILABLE", missingVisits: 0, posRedemptions: { none: { status: "RESERVED" } } },
      data: { status: "REDEEMED", redeemedAt: now, redeemedById: input.userId, redeemedBranchId: input.branchId },
    });
    if (!res.count) throw new UserError("Esta recompensa ya fue canjeada o anulada.");
    await tx.auditLog.create({ data: { organizationId: input.organizationId, userId: input.userId, action: "loyalty.reward_redeem", resource: "LoyaltyReward", resourceId: existing.id, metadata: { memberId: member.id, branchId: input.branchId, ...(input.pos ? { deviceId: input.pos.deviceId, employeeId: input.pos.employeeId, posRequestId: input.pos.requestId } : {}) } } });
    await emitDomainEvent(tx, { organizationId: input.organizationId, type: "loyalty.reward_redeemed", subjectType: "loyalty_member", subjectId: member.id, occurredAt: now,
      payload: { customerId: member.customerId, rewardId: existing.id, ...(input.pos ? { posRequestId: input.pos.requestId, deviceId: input.pos.deviceId, employeeId: input.pos.employeeId } : {}) }, dedupeKey: `loyalty.reward_redeemed:${existing.id}` });
    return existing;
  });
}

// ─── Caja: identificar cliente ──────────────────────────────────────────

/** Busca por token del QR dentro de la organización de la sesión (nunca de otra). */
export async function findMemberIdByToken(organizationId: string, token: string): Promise<string | null> {
  const m = await prisma.loyaltyMember.findFirst({ where: { organizationId, publicToken: token }, select: { id: true, customerId: true } });
  if (!m) return null;
  if (!m.customerId) return m.id;
  return (await prisma.loyaltyMember.findFirst({ where: { organizationId, customerId: m.customerId, isSelected: true }, select: { id: true } }))?.id ?? null;
}

/**
 * Núcleo de registerVisit dentro de una transacción ya abierta: la caja la
 * usa con la suya propia y el consumidor de eventos en una transacción
 * independiente del cobro. Toda regla que pueda fallar
 * se revisa ANTES de escribir, así un LoyaltyRuleError no deja nada a medias.
 * `input.saleAmount` ya viene validado y redondeado.
 */
export async function registerVisitInTx(
  tx: Prisma.TransactionClient,
  input: RegisterVisitInput,
  now: Date
): Promise<RegisterVisitResult> {
  const { organizationId } = input;
  const saleAmount = input.saleAmount;
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "LoyaltyMember" WHERE "id" = ${input.memberId} AND "organizationId" = ${organizationId} FOR UPDATE`;
  if (locked.length === 0) throw new LoyaltyRuleError("member_not_found", "Cliente no encontrado.");

  const member = await tx.loyaltyMember.findUniqueOrThrow({ where: { id: input.memberId } });
  const program = await tx.loyaltyProgram.findUniqueOrThrow({ where: { id: member.programId } });
  const rule = await tx.loyaltyProgramVersion.findUniqueOrThrow({
    where: { programId_version: { programId: program.id, version: program.currentVersion } },
  });

  // Reintento (doble clic, recarga, red lenta): devuelve lo que ya se registró.
  const prior = await tx.loyaltyVisit.findUnique({
    where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: input.idempotencyKey } },
    include: { earnedReward: { select: { id: true, rewardName: true } } },
  });
  const priorSale = input.saleId ? await tx.loyaltyVisit.findUnique({ where: { organizationId_saleId: { organizationId, saleId: input.saleId } } }) : null;
  if (priorSale && !prior) throw new LoyaltyRuleError("invalid_request", "Esta venta ya tiene una visita.");
  if (input.saleId) {
    const sale = await tx.foodSale.findFirst({ where: { id: input.saleId, organizationId, customerId: member.customerId, grossAmount: { gt: 0 } } });
    if (!sale || !member.customerId || sale.branchId !== input.branchId || Number(sale.grossAmount) !== input.saleAmount) throw new LoyaltyRuleError("invalid_request", "Venta y cliente no coinciden.");
  }
  if (prior) {
    if (prior.memberId !== member.id) throw new LoyaltyRuleError("invalid_request", "Solicitud inválida. Recarga la página.");
    return {
      visitId: prior.id,
      replay: true,
      progress: progressOf(member.cycleVisits, rule.visitGoal),
      cycleNumber: member.cycleNumber,
      reward: prior.earnedReward,
      totalVisits: member.totalVisits,
    };
  }

  if (program.status !== "ACTIVE") throw new LoyaltyRuleError("program_paused", "El programa de lealtad está en pausa.");
  if (program.scope === "BRANCH" && program.branchId !== input.branchId) {
    throw new LoyaltyRuleError("branch_not_in_program", "Este programa solo acumula visitas en su sucursal.");
  }
  const policy = input.saleId && input.posCooldownMinutes === undefined
    ? await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { loyaltyVisitCooldownEnabled: true, loyaltyVisitCooldownMinutes: true } }) : null;
  const cooldown = input.saleId ? (input.posCooldownMinutes ?? (policy?.loyaltyVisitCooldownEnabled ? policy.loyaltyVisitCooldownMinutes : 0)) : VISIT_COOLDOWN_MINUTES;
  if (cooldown > 0) {
    const nearby = await tx.loyaltyVisit.findFirst({ where: { organizationId, memberId: member.id, status: "CONFIRMED", occurredAt: {
      gt: new Date(now.getTime() - cooldown * 60_000), lt: new Date(now.getTime() + cooldown * 60_000),
    } } });
    if (nearby) throw new LoyaltyRuleError("cooldown", input.saleId ? "Esta compra está dentro del intervalo configurado entre visitas." : "Este cliente acaba de registrar una visita. Espera unos minutos para registrar otra.");
  }

  const deficit = await tx.loyaltyReward.findFirst({ where: { organizationId, memberId: member.id, missingVisits: { gt: 0 } }, orderBy: { cycleNumber: "asc" } });
  const outcome = applyVisit({ cycleNumber: member.cycleNumber, cycleVisits: member.cycleVisits }, rule.visitGoal);
  const visit = await tx.loyaltyVisit.create({
    data: {
      organizationId,
      programId: program.id,
      memberId: member.id,
      branchId: input.branchId,
      employeeUserId: input.employeeUserId,
      saleId: input.saleId ?? null,
      saleAmount,
      occurredAt: now,
      idempotencyKey: input.idempotencyKey,
      programVersion: deficit?.programVersion ?? rule.version,
      cycleNumber: deficit?.cycleNumber ?? outcome.countedInCycle,
    },
  });

  let reward: { id: string; rewardName: string } | null = null;
  if (outcome.rewardEarned && !deficit) {
    reward = await tx.loyaltyReward.create({
      data: {
        organizationId,
        programId: program.id,
        memberId: member.id,
        programVersion: rule.version,
        cycleNumber: outcome.countedInCycle,
        visitGoal: rule.visitGoal,
        rewardType: rule.rewardType,
        rewardValue: rule.rewardValue,
        rewardName: rule.rewardName,
        rewardDescription: rule.rewardDescription,
        earnedAt: now,
        earnedVisitId: visit.id,
      },
      select: { id: true, rewardName: true },
    });
  }

  const updated = await reconcileMemberInTx(tx, organizationId, member.id);
  await tx.auditLog.create({ data: { organizationId, userId: input.employeeUserId, action: "loyalty.visit_earned", resource: "LoyaltyVisit", resourceId: visit.id, metadata: { saleId: input.saleId ?? null, compensatedCycle: deficit?.cycleNumber ?? null } } });
  await emitDomainEvent(tx, { organizationId, type: "loyalty.visit_earned", subjectType: "loyalty_member", subjectId: member.id, occurredAt: now,
    payload: { customerId: member.customerId, visitId: visit.id, saleId: input.saleId ?? null }, dedupeKey: `loyalty.visit_earned:${visit.id}` });
  if (reward) await emitDomainEvent(tx, { organizationId, type: "loyalty.reward_unlocked", subjectType: "loyalty_member", subjectId: member.id, occurredAt: now,
    payload: { customerId: member.customerId, rewardId: reward.id, rewardName: reward.rewardName }, dedupeKey: `loyalty.reward_unlocked:${reward.id}` });

  return {
    visitId: visit.id,
    replay: false,
    // Recién completado: se muestra la meta alcanzada (10/10) en vez del ciclo nuevo en 0.
    progress: reward ? progressOf(rule.visitGoal, rule.visitGoal) : progressOf(updated.cycleVisits, rule.visitGoal),
    cycleNumber: updated.cycleNumber,
    reward,
    totalVisits: updated.totalVisits,
  };
}

/** The opaque personal card is required; a phone number alone never changes another member's choice. */
export async function chooseMemberProgram(orgSlug: string, token: string, programId: string) {
  const resolved = await resolvePublicProgram(orgSlug, programId);
  if (!resolved || resolved.program.status !== "ACTIVE") throw new UserError("Programa no disponible.");
  const organizationId = resolved.org.id;
  return prisma.$transaction(async (tx) => {
    const owner = await tx.loyaltyMember.findFirst({ where: { organizationId, publicToken: token } });
    if (!owner?.customerId) throw new UserError("Tarjeta no encontrada.");
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${owner.customerId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    await tx.loyaltyMember.updateMany({ where: { organizationId, customerId: owner.customerId, isSelected: true }, data: { isSelected: false } });
    const member = await tx.loyaltyMember.upsert({ where: { programId_customerId: { programId, customerId: owner.customerId } },
      update: { isSelected: true }, create: {
        organizationId, programId, customerId: owner.customerId, isSelected: true,
        name: owner.name, whatsapp: owner.whatsapp, whatsappKey: owner.whatsappKey, postalCode: owner.postalCode, email: owner.email,
        publicToken: generateMemberToken(), consentAt: owner.consentAt, consentTextVersion: owner.consentTextVersion,
      } });
    await tx.auditLog.create({ data: { organizationId, action: "loyalty.member_program", resource: "LoyaltyMember", resourceId: member.id, metadata: { programId } } });
    return { token: member.publicToken };
  });
}
