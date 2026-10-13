import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { getPlan, monthlyPriceMxn } from "@/lib/plans";
import { UserError } from "@/lib/user-error";

// ─── Cobro de la suscripción mensual ─────────────────────────────────────────────────────────────────────────────
// Funciona SIN Stripe: `Organization.billingPeriodEnd` es "pagado hasta" (próximo vencimiento) y cada pago —registrado por un
// admin (transferencia, efectivo…) o por el webhook de Stripe— lo recorre un mes. Con billingPeriodEnd nulo el cliente no se
// factura por aquí: no hay avisos ni estado de pago. Nada se suspende solo: el sistema avisa y el admin decide.

const DAY = 86_400_000;
/** Aviso previo: faltan 7, 3 y 1 días. Después de vencer: el primer día y a los 5 días. */
export type NoticeKind = "D7" | "D3" | "D1" | "OVERDUE" | "OVERDUE_5";
export type BillingState = "NONE" | "ACTIVE" | "DUE_SOON" | "OVERDUE";

export type BillingStatus = {
  state: BillingState;
  dueAt: Date | null;
  /** Días que faltan (redondeado hacia arriba; 0 o negativo = ya venció). */
  daysLeft: number | null;
  /** Días de atraso (0 si no ha vencido). */
  daysOver: number;
};

export function billingStatus(periodEnd: Date | null, now: Date = new Date()): BillingStatus {
  if (!periodEnd) return { state: "NONE", dueAt: null, daysLeft: null, daysOver: 0 };
  const diff = periodEnd.getTime() - now.getTime();
  if (diff < 0) return { state: "OVERDUE", dueAt: periodEnd, daysLeft: Math.ceil(diff / DAY), daysOver: Math.floor(-diff / DAY) };
  const daysLeft = Math.ceil(diff / DAY);
  return { state: daysLeft <= 7 ? "DUE_SOON" : "ACTIVE", dueAt: periodEnd, daysLeft, daysOver: 0 };
}

/** El aviso que corresponde ahora (solo el vigente, para no inundar si el cron estuvo parado). */
export function noticeKindFor(status: BillingStatus): NoticeKind | null {
  if (status.state === "OVERDUE") return status.daysOver >= 5 ? "OVERDUE_5" : "OVERDUE";
  if (status.state !== "DUE_SOON" || status.daysLeft === null) return null;
  return status.daysLeft <= 1 ? "D1" : status.daysLeft <= 3 ? "D3" : "D7";
}

/** Suma meses de calendario conservando el día (31 de enero + 1 mes = 28/29 de febrero). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

export const PAYMENT_METHODS = ["STRIPE", "TRANSFER", "CASH", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type RecordPaymentInput = {
  amountMxn: number;
  method: PaymentMethod;
  /** Meses que cubre el pago (1 por defecto). Ignorado si se manda `periodEnd`. */
  months?: number;
  /** Vencimiento resultante cuando el pagador ya lo sabe (Stripe manda el fin de periodo). */
  periodEnd?: Date;
  externalRef?: string | null;
  note?: string | null;
  recordedById?: string | null;
  now?: Date;
};

/**
 * Registra un pago y recorre el vencimiento. Un pago antes de tiempo suma al vencimiento actual (no se pierde lo ya pagado);
 * un pago de un cliente vencido cuenta desde hoy. Con la misma `externalRef` no se registra dos veces.
 */
export async function recordPayment(organizationId: string, input: RecordPaymentInput): Promise<{ applied: boolean; periodEnd: Date }> {
  const now = input.now ?? new Date();
  const months = input.months ?? 1;
  if (!Number.isFinite(input.amountMxn) || input.amountMxn < 0) throw new UserError("Revisa el monto del pago");
  if (!input.periodEnd && (!Number.isInteger(months) || months < 1 || months > 24)) throw new UserError("Los meses del pago no son válidos");

  return prisma.$transaction(async (tx) => {
    const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { billingPeriodEnd: true } });
    if (!org) throw new UserError("Cliente no encontrado");
    const externalRef = input.externalRef?.trim() || null;
    if (externalRef) {
      const dup = await tx.billingPayment.findUnique({ where: { organizationId_externalRef: { organizationId, externalRef } }, select: { periodEnd: true } });
      if (dup) return { applied: false, periodEnd: dup.periodEnd };
    }
    const current = org.billingPeriodEnd;
    const start = current && current > now ? current : now;
    const periodEnd = input.periodEnd ?? addMonths(start, months);
    await tx.billingPayment.create({
      data: { organizationId, amountMxn: input.amountMxn, method: input.method, periodStart: start, periodEnd, externalRef, note: input.note?.trim() || null, recordedById: input.recordedById ?? null },
    });
    // Un pago nunca acorta lo ya pagado (p. ej. un reintento antiguo de Stripe).
    if (!current || periodEnd > current) await tx.organization.update({ where: { id: organizationId }, data: { billingPeriodEnd: periodEnd } });
    return { applied: true, periodEnd: !current || periodEnd > current ? periodEnd : current };
  });
}

/** Fija (o quita, con null) el próximo vencimiento de un cliente. Es la forma de dar de alta a alguien en el cobro. */
export async function setBillingDueDate(organizationId: string, dueAt: Date | null, adminId: string, reason: string) {
  const before = await prisma.organization.findUnique({ where: { id: organizationId }, select: { billingPeriodEnd: true } });
  if (!before) throw new UserError("Cliente no encontrado");
  await prisma.organization.update({ where: { id: organizationId }, data: { billingPeriodEnd: dueAt } });
  await logAudit({ organizationId, userId: adminId, action: "billing.due_date", resource: "Organization", resourceId: organizationId, metadata: { from: before.billingPeriodEnd?.toISOString() ?? null, to: dueAt?.toISOString() ?? null, reason } });
}

export type BillingView = BillingStatus & {
  amountMxn: number;
  stripeSubscription: boolean;
  payments: { id: string; amountMxn: number; method: string; periodEnd: Date; createdAt: Date; note: string | null; externalRef: string | null }[];
};

export async function getBillingView(organizationId: string, now: Date = new Date()): Promise<BillingView> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true, billingPeriodEnd: true, customMonthlyPriceMxn: true, stripeSubscriptionStatus: true } });
  const [plan, payments] = await Promise.all([
    getPlan(org.plan),
    prisma.billingPayment.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  return {
    ...billingStatus(org.billingPeriodEnd, now),
    amountMxn: monthlyPriceMxn(plan, org.customMonthlyPriceMxn !== null ? Number(org.customMonthlyPriceMxn) : null),
    stripeSubscription: org.stripeSubscriptionStatus === "active" || org.stripeSubscriptionStatus === "trialing",
    payments: payments.map((p) => ({ id: p.id, amountMxn: Number(p.amountMxn), method: p.method, periodEnd: p.periodEnd, createdAt: p.createdAt, note: p.note, externalRef: p.externalRef })),
  };
}
