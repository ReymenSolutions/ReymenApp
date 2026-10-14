"use server";

// ─── REYMEN Loyalty — acciones del negocio (con sesión) ───────────────
// Mismo patrón que src/actions/food.ts: auth → módulo → validar (zod, del
// lado del servidor) → mutar con el organizationId de la SESIÓN (nunca del
// formulario) → auditar (dentro de service.ts) → revalidatePath.

import { prisma } from "@/lib/prisma";
import { reconcileLoyaltyMember } from "@/lib/loyalty/reconcile";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireLoyaltyManager, requireLoyaltyOperator } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { MAIN_BRANCH_PARAM } from "@/lib/branches";
import {
  findMemberIdByToken,
  getActiveProgram,
  redeemReward,
  registerVisit,
  saveProgram,
  MAX_SALE_AMOUNT,
  type RegisterVisitResult,
} from "@/lib/loyalty/service";
import { getCheckoutMember, searchMembersForCheckout, type CheckoutMember } from "@/lib/loyalty/queries";
import { extractMemberToken } from "@/lib/loyalty/token";
import { saveLocation } from "@/lib/loyalty/locations";

const LOYALTY_PATHS = [
  "/portal/loyalty",
  "/portal/loyalty/members",
  "/portal/loyalty/visits",
  "/portal/loyalty/map",
  "/portal/loyalty/analytics",
  "/portal/loyalty/program",
];

function revalidateLoyalty(extra: string[] = []) {
  for (const p of [...LOYALTY_PATHS, ...extra]) revalidatePath(p);
}

/** "main" o "" → sucursal principal (null); cualquier otro valor se valida en service.ts. */
function parseBranch(raw: string | null | undefined): string | null {
  if (!raw || raw === MAIN_BRANCH_PARAM) return null;
  return raw;
}

// ─── Programa ───────────────────────────────────────────────────────────

const programSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]),
  visitGoal: z.coerce.number().int().min(2).max(50),
  rewardType: z.enum(["FREE_ITEM", "DISCOUNT_PERCENT", "DISCOUNT_AMOUNT", "CUSTOM"]),
  rewardName: z.string().trim().min(2).max(60),
  rewardDescription: z.string().trim().max(300).optional(),
  rewardHeadline: z.string().trim().max(120).optional(),
  scope: z.enum(["ORGANIZATION", "BRANCH"]).default("ORGANIZATION"),
  branchId: z.string().optional(),
});

export async function saveLoyaltyProgram(data: z.input<typeof programSchema>) {
  const session = await requireLoyaltyManager();
  const parsed = programSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa los datos del programa.");
  const d = parsed.data;
  const result = await saveProgram(session.user.organizationId, session.user.id, {
    name: d.name,
    description: d.description || null,
    status: d.status,
    visitGoal: d.visitGoal,
    rewardType: d.rewardType,
    rewardName: d.rewardName,
    rewardDescription: d.rewardDescription || null,
    rewardHeadline: d.rewardHeadline || null,
    scope: d.scope,
    branchId: d.scope === "BRANCH" ? parseBranch(d.branchId) : null,
  });
  revalidateLoyalty();
  return { version: result.version, ruleChanged: result.ruleChanged, created: result.created };
}

// ─── Ubicación de las sucursales (mapa y distancias) ───────────────────

const locationSchema = z.object({
  branchKey: z.string().trim().min(1).max(40),
  postalCode: z.string().trim().max(10),
  lat: z.coerce.number(),
  lng: z.coerce.number(),
});

export async function saveLoyaltyLocation(data: z.input<typeof locationSchema>) {
  const session = await requireLoyaltyManager();
  const parsed = locationSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa el código postal y la ubicación.");
  const saved = await saveLocation(session.user.organizationId, session.user.id, parsed.data);
  revalidateLoyalty();
  return { postalCode: saved.postalCode, lat: saved.latitude, lng: saved.longitude };
}

// ─── Caja ───────────────────────────────────────────────────────────────

export type LookupResult = { member: CheckoutMember } | { member: null; reason: "not_found" | "invalid" };

/** Identifica al cliente por lo que capturó la caja: la URL/QR de su tarjeta o el token solo. */
export async function lookupLoyaltyMemberByCode(code: string): Promise<LookupResult> {
  const session = await requireLoyaltyOperator();
  const orgId = session.user.organizationId;
  const token = extractMemberToken(String(code ?? "").slice(0, 300));
  if (!token) return { member: null, reason: "invalid" };
  const program = await getActiveProgram(orgId);
  if (!program) throw new UserError("Primero configura el programa de lealtad.");
  const id = await findMemberIdByToken(orgId, token);
  const member = id ? await getCheckoutMember(orgId, id, program.rule.visitGoal) : null;
  return member ? { member } : { member: null, reason: "not_found" };
}

export async function getLoyaltyMemberForCheckout(memberId: string): Promise<CheckoutMember | null> {
  const session = await requireLoyaltyOperator();
  const program = await getActiveProgram(session.user.organizationId);
  if (!program) throw new UserError("Primero configura el programa de lealtad.");
  return getCheckoutMember(session.user.organizationId, String(memberId), program.rule.visitGoal);
}

export async function searchLoyaltyMembers(q: string) {
  const session = await requireLoyaltyOperator();
  const program = await getActiveProgram(session.user.organizationId);
  if (!program) return [];
  return searchMembersForCheckout(session.user.organizationId, program.id, String(q ?? "").slice(0, 80));
}

const visitSchema = z.object({
  memberId: z.string().min(1).max(40),
  branch: z.string().max(40).optional(),
  // Vacío = solo la visita, sin monto.
  saleAmount: z.union([z.literal(""), z.coerce.number().positive().max(MAX_SALE_AMOUNT)]).optional(),
  idempotencyKey: z.string().min(8).max(70),
});

export async function registerLoyaltyVisit(data: z.input<typeof visitSchema>): Promise<RegisterVisitResult> {
  const session = await requireLoyaltyOperator();
  const parsed = visitSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa el monto de la venta.");
  const d = parsed.data;
  const result = await registerVisit({
    organizationId: session.user.organizationId,
    employeeUserId: session.user.id,
    memberId: d.memberId,
    branchId: parseBranch(d.branch),
    saleAmount: d.saleAmount === "" || d.saleAmount === undefined ? null : d.saleAmount,
    idempotencyKey: `manual:${d.idempotencyKey}`,
  });
  revalidateLoyalty([`/portal/loyalty/members/${d.memberId}`]);
  return result;
}

export async function redeemLoyaltyReward(data: { rewardId: string; branch?: string }) {
  const session = await requireLoyaltyOperator();
  const rewardId = String(data?.rewardId ?? "");
  if (!rewardId || rewardId.length > 40) throw new UserError("Recompensa no encontrada.");
  const reward = await redeemReward({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    rewardId,
    branchId: parseBranch(data.branch),
  });
  revalidateLoyalty([`/portal/loyalty/members/${reward.memberId}`]);
  return { rewardName: reward.rewardName };
}

/** Rebuild projections only; never award historical sales. */
export async function reconcileLoyalty(memberId: string) {
  const session = await requireLoyaltyManager();
  const id = z.string().min(1).max(40).parse(memberId);
  const result = await reconcileLoyaltyMember(session.user.organizationId, id, session.user.id);
  revalidateLoyalty([`/portal/loyalty/members/${id}`]);
  return result;
}

/** Recover exhausted delivery attempts, retaining durable Loyalty receipts. */
export async function retryLoyaltyEvents() {
  const session = await requireLoyaltyManager();
  const organizationId = session.user.organizationId;
  return prisma.$transaction(async (tx) => {
    const result = await tx.domainEvent.updateMany({ where: { organizationId, status: "FAILED", type: { in: ["sale.completed", "sale.cancelled"] } }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), error: null } });
    await tx.auditLog.create({ data: { organizationId, userId: session.user.id, action: "loyalty.events_retry", resource: "DomainEvent", metadata: { count: result.count } } });
    return result;
  });
}
