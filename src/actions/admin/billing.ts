"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { PAYMENT_METHODS, billingStatus, getBillingView, recordPayment, setBillingDueDate, type BillingView, type BillingStatus } from "@/lib/billing";

// ─── Admin → Cliente → Suscripción: registrar pagos y fijar vencimientos (todo auditado) ─────────────────────────

const idSchema = z.object({ orgId: z.string().min(1) });
const reasonSchema = z.string().trim().min(5).max(300);

function refresh(orgId: string) {
  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/admin/clients");
  revalidatePath("/portal/settings");
}

export async function getOrgBilling(data: { orgId: string }): Promise<BillingView> {
  await requireAdmin();
  const { orgId } = idSchema.parse(data);
  return getBillingView(orgId);
}

/** Registra un pago recibido (transferencia, efectivo…) y recorre el vencimiento. Con la misma referencia no se duplica. */
export async function recordOrgPayment(data: { orgId: string; amountMxn: number; method: string; months?: number; externalRef?: string; note?: string }) {
  const session = await requireAdmin();
  const parsed = z.object({ orgId: z.string().min(1), amountMxn: z.coerce.number().min(0).max(10_000_000), method: z.enum(PAYMENT_METHODS), months: z.coerce.number().int().min(1).max(24).default(1), externalRef: z.string().trim().max(120).optional(), note: z.string().trim().max(300).optional() }).safeParse(data);
  if (!parsed.success) throw new UserError("Revisa el monto y el motivo");
  const d = parsed.data;
  const out = await recordPayment(d.orgId, { amountMxn: d.amountMxn, method: d.method, months: d.months, externalRef: d.externalRef, note: d.note, recordedById: session.user.id });
  if (out.applied) await logAudit({ organizationId: d.orgId, userId: session.user.id, action: "billing.payment", resource: "Organization", resourceId: d.orgId, metadata: { amountMxn: d.amountMxn, method: d.method, months: d.months, periodEnd: out.periodEnd.toISOString(), externalRef: d.externalRef ?? null } });
  refresh(d.orgId);
  return { success: true, applied: out.applied, periodEnd: out.periodEnd };
}

/** Fija el próximo vencimiento (da de alta al cliente en el cobro) o lo quita con null. Exige un motivo. */
export async function setOrgBillingDueDate(data: { orgId: string; dueAt: string | null; reason: string }) {
  const session = await requireAdmin();
  const { orgId } = idSchema.parse(data);
  const reason = reasonSchema.safeParse(data.reason);
  if (!reason.success) throw new UserError("Revisa el monto y el motivo");
  let dueAt: Date | null = null;
  if (data.dueAt) {
    dueAt = new Date(`${data.dueAt}T23:59:59.000Z`);
    if (Number.isNaN(dueAt.getTime())) throw new UserError("Fecha no válida");
  }
  await setBillingDueDate(orgId, dueAt, session.user.id, reason.data);
  refresh(orgId);
  return { success: true };
}

export type CollectionRow = { orgId: string; name: string; plan: string; dueAt: Date; state: BillingStatus["state"]; daysLeft: number | null; daysOver: number };

/** Clientes vencidos o por vencer (7 días), para la vista de cobranza. */
export async function listCollections(): Promise<CollectionRow[]> {
  await requireAdmin();
  const now = new Date();
  const orgs = await prisma.organization.findMany({ where: { isActive: true, billingPeriodEnd: { not: null } }, select: { id: true, name: true, plan: true, billingPeriodEnd: true } });
  return orgs
    .map((o) => ({ o, s: billingStatus(o.billingPeriodEnd, now) }))
    .filter(({ s }) => s.state === "OVERDUE" || s.state === "DUE_SOON")
    .map(({ o, s }) => ({ orgId: o.id, name: o.name, plan: o.plan, dueAt: o.billingPeriodEnd!, state: s.state, daysLeft: s.daysLeft, daysOver: s.daysOver }))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}
