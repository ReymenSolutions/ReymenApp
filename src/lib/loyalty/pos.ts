// Read-only POS lookup. Accrual is handled by the DomainEvent consumer.
import type { Prisma } from "@prisma/client";
import { hasModule } from "@/lib/modules";
import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/phone";
import { normalizePhoneMx } from "@/lib/customers";
import { progressOf, type Progress } from "./cycle";
import { extractMemberToken, firstName, maskPhone } from "./token";
import { getActiveProgram } from "./service";

type Db = Prisma.TransactionClient | typeof prisma;

/** Bloque `loyalty` que el POS manda en la orden o en la consulta. */
export interface PosLoyaltyRequest {
  /** Contenido del QR de la tarjeta (URL completa) o el token solo. */
  code?: string;
  /** WhatsApp del cliente, si el cajero lo busca por teléfono. */
  phone?: string;
}

export function parsePosLoyalty(raw: unknown): PosLoyaltyRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
  const req: PosLoyaltyRequest = { code: str(r.code, 300), phone: str(r.phone, 30) };
  return req.code || req.phone ? req : null;
}

/** Miembro del programa por QR/token o, si no hay, por WhatsApp. Solo de esta organización. */
async function findMember(db: Db, organizationId: string, _programId: string, req: PosLoyaltyRequest) {
  const token = req.code ? extractMemberToken(req.code) : null;
  if (token) {
    const owner = await db.loyaltyMember.findFirst({ where: { organizationId, publicToken: token }, select: { customerId: true } });
    return owner?.customerId ? db.loyaltyMember.findFirst({ where: { organizationId, customerId: owner.customerId, isSelected: true }, select: { id: true, programId: true } }) : null;
  }
  const phone = req.phone ? normalizePhoneMx(req.phone) : null;
  const key = phone ? phoneKey(phone) : null;
  if (key) {
    return db.loyaltyMember.findFirst({ where: { organizationId, isSelected: true, whatsappKey: key }, select: { id: true, programId: true } });
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
      rewards: { where: { status: "AVAILABLE", missingVisits: 0, posRedemptions: { none: { status: { in: ["RESERVED", "COMMITTED"] } } } }, orderBy: { earnedAt: "asc" }, select: { id: true, rewardName: true, rewardDescription: true } },
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
  let program = await getActiveProgram(organizationId);
  if (!program) return { status: "no_program" };
  const found = await findMember(prisma, organizationId, program.id, req);
  if (!found) return { status: "not_enrolled" };
  program = await getActiveProgram(organizationId, found.programId);
  if (!program || program.status !== "ACTIVE") return { status: "program_paused" };
  return {
    status: "found",
    program: { name: program.name, rewardName: program.rule.rewardName, visitGoal: program.rule.visitGoal },
    member: await memberView(prisma, found.id, program.rule.visitGoal),
  };
}

/** Authenticated device lookup; never returns the private card token. */
export async function lookupCustomerForPos(organizationId: string, rawPhone: unknown) {
  const phone = normalizePhoneMx(rawPhone);
  const key = phone ? phoneKey(phone) : null;
  if (!phone || !key) return { status: "invalid_request" as const };
  const customer = await prisma.customer.findUnique({
    where: { organizationId_phoneKey: { organizationId, phoneKey: key } },
    select: { name: true, postalCode: true, consentAccepted: true },
  });
  if (!customer) return { status: "not_found" as const };
  const loyalty = await hasModule(organizationId, "LOYALTY")
    ? await lookupMemberForPos(organizationId, { phone }) : { status: "module_disabled" as const };
  return { status: "found" as const, customer, loyalty };
}
