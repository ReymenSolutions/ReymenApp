import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { notifyAdmins } from "@/lib/admin-notifications";
import { appUrl } from "@/lib/app-url";
import { BILLING_GRACE_MS } from "./billing-access";
import { billingStatus, noticeKindFor, type NoticeKind } from "@/lib/billing";
import { getPlan, monthlyPriceMxn } from "@/lib/plans";

// Avisos de vencimiento (7, 3 y 1 días antes; al vencer; al suspenderse después de 3 días). Un solo aviso por tipo y vencimiento.
// Se mandan por correo a quien administra la cuenta; los atrasos también avisan a los admins de Reymen.

const dateEs = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const exactDate = (d: Date) => d.toLocaleString("es-MX", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" }) + " UTC";

export function noticeCopy(kind: NoticeKind, dueAt: Date, amountMxn: number): { subject: string; text: string } {
  const due = dateEs(dueAt);
  const amount = `$${amountMxn.toLocaleString("en-US")} MXN`;
  const deadline = ` Si no se confirma el pago, los módulos se suspenderán el ${exactDate(new Date(dueAt.getTime() + BILLING_GRACE_MS))}. Conservarás facturación, soporte y tus datos. El acceso se recupera al confirmarse un pago que cubra el periodo vigente.`;
  const copy = (() => { switch (kind) {
    case "D7": return { subject: "Tu suscripción vence en 7 días", text: `Tu suscripción de Reymen vence el ${due} (${amount}). Para no interrumpir el servicio, realiza tu pago antes de esa fecha.` };
    case "D3": return { subject: "Tu suscripción vence en 3 días", text: `Tu suscripción de Reymen vence el ${due} (${amount}). Realiza tu pago para no interrumpir el servicio.` };
    case "D1": return { subject: "Tu suscripción vence mañana", text: `Tu suscripción de Reymen vence mañana, ${due} (${amount}). Realiza tu pago hoy para no interrumpir el servicio.` };
    case "OVERDUE": return { subject: "Tu suscripción venció", text: `Tu suscripción de Reymen venció el ${due} (${amount}). Regulariza tu pago lo antes posible; si ya pagaste, avísanos desde Solicitudes y lo registramos.` };
    case "SUSPENDED": return { subject: "Módulos suspendidos por pago pendiente", text: `La suspensión por falta de pago comenzó el ${exactDate(new Date(dueAt.getTime() + BILLING_GRACE_MS))}. Facturación y soporte siguen disponibles. Conservamos tus datos y reactivamos el acceso al confirmarse un pago que cubra el periodo vigente.` };
    case "OVERDUE_5": return { subject: "Tu suscripción lleva 5 días vencida", text: `Tu suscripción de Reymen venció el ${due} y sigue pendiente (${amount}). Regulariza tu pago para evitar que se suspenda el servicio.` };
  } })();
  return { ...copy, text: copy.text + (kind === "SUSPENDED" ? "" : deadline) };
}

export type NoticeRun = { checked: number; sent: number };

/** Revisa a los clientes con vencimiento y manda el aviso que toque y no se haya mandado. Ejecutado cada 15 minutos; la reserva evita duplicados concurrentes. */
export async function runBillingNotices(now: Date = new Date()): Promise<NoticeRun> {
  const orgs = await prisma.organization.findMany({
    where: { isActive: true, billingPeriodEnd: { not: null } },
    select: { id: true, name: true, plan: true, billingPeriodEnd: true, customMonthlyPriceMxn: true, stripeSubscriptionStatus: true },
  });
  let sent = 0;
  for (const org of orgs) {
    const status = billingStatus(org.billingPeriodEnd, now);
    const kind = noticeKindFor(status);
    if (!kind || !org.billingPeriodEnd) continue;
    const notice = await prisma.billingNotice.upsert({
      where: { organizationId_periodEnd_kind: { organizationId: org.id, periodEnd: org.billingPeriodEnd, kind } },
      create: { organizationId: org.id, periodEnd: org.billingPeriodEnd, kind }, update: {},
    });
    const claimed = await prisma.billingNotice.updateMany({
      where: { id: notice.id, sentAt: null, attempts: { lt: 5 }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + 15 * 60_000) },
    });
    if (!claimed.count) continue;
    const plan = await getPlan(org.plan);
    const copy = noticeCopy(kind, org.billingPeriodEnd, monthlyPriceMxn(plan, org.customMonthlyPriceMxn !== null ? Number(org.customMonthlyPriceMxn) : null));
    if (["active", "trialing"].includes(org.stripeSubscriptionStatus ?? "") && status.state !== "OVERDUE") copy.text = `Stripe intentará el cobro automático en la renovación. ${copy.text}`;
    const link = appUrl("/portal/settings#facturacion");
    const owners = await prisma.user.findMany({ where: { organizationId: org.id, role: { in: ["OWNER", "SUPER_ADMIN"] }, isActive: true }, select: { email: true } });
    const delivered = await Promise.all(owners.map((o) => sendEmail({ to: o.email, subject: copy.subject, html: `<p>${copy.text}</p><p><a href="${link}">Ver mi suscripción</a></p>`, text: `${copy.text}\n${link}` }).catch(() => ({ sent: false }))));
    if (!owners.length || delivered.some(result => !result.sent)) continue;
    await prisma.billingNotice.update({ where: { id: notice.id }, data: { sentAt: now, nextAttemptAt: null } });
    sent++;
    if (status.state === "OVERDUE") {
      const t = `${org.name}: ${copy.subject.toLowerCase()} (venció el ${dateEs(org.billingPeriodEnd)}).`;
      await notifyAdmins({ subject: `Cobranza: ${org.name} con pago vencido`, html: `<p>${t}</p>`, text: t }).catch(() => undefined);
    }
    await logAudit({ organizationId: org.id, action: "billing.notice", resource: "Organization", resourceId: org.id, metadata: { kind, dueAt: org.billingPeriodEnd.toISOString() } });
  }
  return { checked: orgs.length, sent };
}
