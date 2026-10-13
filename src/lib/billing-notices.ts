import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { notifyAdmins } from "@/lib/admin-notifications";
import { appUrl } from "@/lib/app-url";
import { billingStatus, noticeKindFor, type NoticeKind } from "@/lib/billing";
import { getPlan, monthlyPriceMxn } from "@/lib/plans";

// Avisos de vencimiento (7, 3 y 1 días antes; al vencer; a los 5 días de atraso). Un solo aviso por tipo y vencimiento.
// Se mandan por correo a quien administra la cuenta; los atrasos también avisan a los admins de Reymen.

const dateEs = (d: Date) => d.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function noticeCopy(kind: NoticeKind, dueAt: Date, amountMxn: number): { subject: string; text: string } {
  const due = dateEs(dueAt);
  const amount = `$${amountMxn.toLocaleString("en-US")} MXN`;
  switch (kind) {
    case "D7": return { subject: "Tu suscripción vence en 7 días", text: `Tu suscripción de Reymen vence el ${due} (${amount}). Para no interrumpir el servicio, realiza tu pago antes de esa fecha.` };
    case "D3": return { subject: "Tu suscripción vence en 3 días", text: `Tu suscripción de Reymen vence el ${due} (${amount}). Realiza tu pago para no interrumpir el servicio.` };
    case "D1": return { subject: "Tu suscripción vence mañana", text: `Tu suscripción de Reymen vence mañana, ${due} (${amount}). Realiza tu pago hoy para no interrumpir el servicio.` };
    case "OVERDUE": return { subject: "Tu suscripción venció", text: `Tu suscripción de Reymen venció el ${due} (${amount}). Regulariza tu pago lo antes posible; si ya pagaste, avísanos desde Solicitudes y lo registramos.` };
    case "OVERDUE_5": return { subject: "Tu suscripción lleva 5 días vencida", text: `Tu suscripción de Reymen venció el ${due} y sigue pendiente (${amount}). Regulariza tu pago para evitar que se suspenda el servicio.` };
  }
}

export type NoticeRun = { checked: number; sent: number };

/** Revisa a los clientes con vencimiento y manda el aviso que toque y no se haya mandado. Pensado para un cron diario. */
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
    // Con cobro automático de Stripe, el aviso previo es ruido: solo avisamos si de verdad no se cobró.
    const autoCharge = org.stripeSubscriptionStatus === "active" || org.stripeSubscriptionStatus === "trialing";
    if (autoCharge && status.state !== "OVERDUE") continue;
    try {
      await prisma.billingNotice.create({ data: { organizationId: org.id, periodEnd: org.billingPeriodEnd, kind } });
    } catch {
      continue; // ya se mandó
    }
    sent++;
    const plan = await getPlan(org.plan);
    const copy = noticeCopy(kind, org.billingPeriodEnd, monthlyPriceMxn(plan, org.customMonthlyPriceMxn !== null ? Number(org.customMonthlyPriceMxn) : null));
    const link = appUrl("/portal/settings#facturacion");
    const owners = await prisma.user.findMany({ where: { organizationId: org.id, role: "OWNER", isActive: true }, select: { email: true } });
    await Promise.all(owners.map((o) => sendEmail({ to: o.email, subject: copy.subject, html: `<p>${copy.text}</p><p><a href="${link}">Ver mi suscripción</a></p>`, text: `${copy.text}\n${link}` }).catch(() => undefined)));
    if (status.state === "OVERDUE") {
      const t = `${org.name}: ${copy.subject.toLowerCase()} (venció el ${dateEs(org.billingPeriodEnd)}).`;
      await notifyAdmins({ subject: `Cobranza: ${org.name} con pago vencido`, html: `<p>${t}</p>`, text: t }).catch(() => undefined);
    }
    await logAudit({ organizationId: org.id, action: "billing.notice", resource: "Organization", resourceId: org.id, metadata: { kind, dueAt: org.billingPeriodEnd.toISOString() } });
  }
  return { checked: orgs.length, sent };
}
