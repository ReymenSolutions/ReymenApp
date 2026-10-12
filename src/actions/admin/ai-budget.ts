"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { AiBudgetError, creditBudget, extendBudget, getBudgetState, resetBudget, setBudgetPolicy, setMonthlyBudget, type BudgetState } from "@/lib/ai/budget";
import { evaluateBudgetAlerts } from "@/lib/ai/budget-alerts";
import { getAgentStatuses, type AgentStatusRow } from "@/lib/ai/agent-status";

// ─── Presupuesto de IA por tenant: consultar, ampliar, restablecer, fijar y política (todo auditado, solo admin) ──────

const idSchema = z.object({ orgId: z.string().min(1) });
const reasonSchema = z.string().trim().min(5, "Escribe el motivo").max(300);
const amount = z.coerce.number().positive().max(1_000_000);

export type AdjustmentRow = { id: string; type: string; amountMxn: number; reason: string; createdAt: Date; createdBy: string | null; externalRef: string | null };
export type OrgAiBudgetView = { state: BudgetState; agents: AgentStatusRow[]; blocked: boolean; adjustments: AdjustmentRow[]; alerts: { threshold: number; createdAt: Date }[] };

async function assertOrg(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) throw new UserError("Cliente no encontrado");
}

/** El presupuesto del ciclo en curso de un cliente, con el estado de sus agentes y el historial de ajustes. */
export async function getOrgAiBudget(data: z.infer<typeof idSchema>): Promise<OrgAiBudgetView> {
  await requireAdmin();
  const { orgId } = idSchema.parse(data);
  await assertOrg(orgId);
  const state = await getBudgetState(orgId);
  const [status, adjustments, alerts] = await Promise.all([
    getAgentStatuses(orgId),
    prisma.aiBudgetAdjustment.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.aiBudgetAlert.findMany({ where: { organizationId: orgId, cycleStart: state.cycleStart }, orderBy: { threshold: "asc" }, select: { threshold: true, createdAt: true } }),
  ]);
  const users = await prisma.user.findMany({ where: { id: { in: adjustments.map((a) => a.createdById).filter((x): x is string => !!x) } }, select: { id: true, name: true, email: true } });
  const who = new Map(users.map((u) => [u.id, u.name ?? u.email]));
  return { state, agents: status.agents, blocked: status.blocked, alerts, adjustments: adjustments.map((a) => ({ id: a.id, type: a.type, amountMxn: Number(a.amountMxn), reason: a.reason, createdAt: a.createdAt, createdBy: a.createdById ? (who.get(a.createdById) ?? null) : null, externalRef: a.externalRef })) };
}

async function audited(orgId: string, adminId: string, action: string, metadata: Record<string, unknown>) {
  await logAudit({ organizationId: orgId, userId: adminId, action, resource: "Organization", resourceId: orgId, metadata });
  await evaluateBudgetAlerts(orgId).catch(() => undefined);
  revalidatePath(`/admin/clients/${orgId}`);
}

/** Amplía el presupuesto del ciclo (excepción autorizada). Desbloquea los agentes si quedaba bloqueado. */
export async function extendOrgAiBudget(data: { orgId: string; amountMxn: number; reason: string }) {
  const session = await requireAdmin();
  const { orgId } = idSchema.parse(data);
  const parsed = z.object({ amount, reason: reasonSchema }).safeParse({ amount: data.amountMxn, reason: data.reason });
  if (!parsed.success) throw new UserError("Revisa el monto y el motivo");
  await assertOrg(orgId);
  const out = await extendBudget(orgId, parsed.data.amount, parsed.data.reason, session.user.id);
  await audited(orgId, session.user.id, "ai.budget_extend", { amountMxn: parsed.data.amount, reason: parsed.data.reason, adjustmentId: out.id });
  return { success: true, state: out.state };
}

/** Restablece el presupuesto del ciclo (vuelve a quedar completo; el consumo ya registrado se conserva en el historial). */
export async function resetOrgAiBudget(data: { orgId: string; reason: string }) {
  const session = await requireAdmin();
  const { orgId } = idSchema.parse(data);
  const reason = reasonSchema.safeParse(data.reason);
  if (!reason.success) throw new UserError("Revisa el monto y el motivo");
  await assertOrg(orgId);
  const out = await resetBudget(orgId, reason.data, session.user.id);
  await audited(orgId, session.user.id, "ai.budget_reset", { reason: reason.data, adjustmentId: out.id });
  return { success: true, state: out.state };
}

/** Crédito o ajuste administrativo (un monto negativo compensa un error anterior). */
export async function creditOrgAiBudget(data: { orgId: string; amountMxn: number; reason: string }) {
  const session = await requireAdmin();
  const { orgId } = idSchema.parse(data);
  const parsed = z.object({ amount: z.coerce.number().min(-1_000_000).max(1_000_000).refine((n) => n !== 0), reason: reasonSchema }).safeParse({ amount: data.amountMxn, reason: data.reason });
  if (!parsed.success) throw new UserError("Revisa el monto y el motivo");
  await assertOrg(orgId);
  const out = await creditBudget(orgId, parsed.data.amount, parsed.data.reason, session.user.id);
  await audited(orgId, session.user.id, "ai.budget_credit", { amountMxn: parsed.data.amount, reason: parsed.data.reason, adjustmentId: out.id });
  return { success: true, state: out.state };
}

/** Fija el presupuesto mensual de un cliente (vacío = el predeterminado de su plan). */
export async function setOrgAiBudget(data: { orgId: string; monthlyBudgetMxn: number | null }) {
  const session = await requireAdmin();
  const { orgId } = idSchema.parse(data);
  const value = data.monthlyBudgetMxn === null ? null : amount.safeParse(data.monthlyBudgetMxn);
  if (value && !value.success) throw new UserError("Revisa el monto y el motivo");
  await assertOrg(orgId);
  const before = await getBudgetState(orgId);
  await setMonthlyBudget(orgId, value ? value.data : null, session.user.id);
  await audited(orgId, session.user.id, "ai.budget_set", { fromMxn: before.baseMxn, toMxn: value ? value.data : null });
  return { success: true, state: await getBudgetState(orgId) };
}

/**
 * Política al llegar al 100 %. Bloquear es la predeterminada; usar un modelo económico exige configuración explícita:
 * un modelo con tarifa y un tope de gasto extra. Queda a nombre del admin que lo autoriza.
 */
export async function setOrgAiBudgetPolicy(data: { orgId: string; policy: "BLOCK" | "DEGRADE"; provider?: string; model?: string; capMxn?: number }) {
  const session = await requireAdmin();
  const { orgId } = idSchema.parse(data);
  await assertOrg(orgId);
  if (data.policy === "BLOCK") {
    await setBudgetPolicy(orgId, { policy: "BLOCK" }, session.user.id);
  } else {
    const parsed = z.object({ provider: z.string().min(1), model: z.string().min(1), capMxn: amount }).safeParse(data);
    if (!parsed.success) throw new UserError("Revisa el monto y el motivo");
    try {
      await setBudgetPolicy(orgId, { policy: "DEGRADE", provider: parsed.data.provider, model: parsed.data.model, capMxn: parsed.data.capMxn }, session.user.id);
    } catch (err) {
      if (err instanceof AiBudgetError) throw new UserError("El modelo económico no tiene una tarifa cargada");
      throw err;
    }
  }
  await audited(orgId, session.user.id, "ai.budget_policy", { policy: data.policy, provider: data.provider ?? null, model: data.model ?? null, capMxn: data.capMxn ?? null });
  return { success: true, state: await getBudgetState(orgId) };
}
