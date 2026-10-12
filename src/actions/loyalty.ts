"use server";

// ─── REYMEN Loyalty — acciones del negocio (con sesión) ───────────────
// Mismo patrón que src/actions/food.ts: auth → módulo → validar (zod, del
// lado del servidor) → mutar con el organizationId de la SESIÓN (nunca del
// formulario) → auditar (dentro de service.ts) → revalidatePath.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFoodManager, requireLoyaltyOperator } from "@/lib/guards";
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

const LOYALTY_PATHS = [
  "/portal/food/loyalty",
  "/portal/food/loyalty/members",
  "/portal/food/loyalty/visits",
  "/portal/food/loyalty/map",
  "/portal/food/loyalty/analytics",
  "/portal/food/loyalty/program",
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
  const session = await requireFoodManager();
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
  idempotencyKey: z.string().min(8).max(80),
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
    idempotencyKey: d.idempotencyKey,
  });
  revalidateLoyalty([`/portal/food/loyalty/members/${d.memberId}`]);
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
  revalidateLoyalty([`/portal/food/loyalty/members/${reward.memberId}`]);
  return { rewardName: reward.rewardName };
}
