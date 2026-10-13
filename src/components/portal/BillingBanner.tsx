import Link from "next/link";
import { AlertTriangle, Clock } from "lucide-react";
import type { BillingStatus } from "@/lib/billing";
import { formatDate } from "@/lib/utils";

/** Aviso de vencimiento de la suscripción (solo para quien administra la cuenta). Escala de color según qué tan cerca o vencido esté. */
export function BillingBanner({ status, lang }: { status: BillingStatus; lang: string }) {
  if ((status.state !== "DUE_SOON" && status.state !== "OVERDUE") || !status.dueAt) return null;
  const es = lang !== "en";
  const overdue = status.state === "OVERDUE";
  const date = formatDate(status.dueAt);
  const msg = overdue
    ? es ? `Tu suscripción venció el ${date}. Regulariza tu pago para evitar que se suspenda el servicio.` : `Your subscription expired on ${date}. Settle your payment to avoid a service suspension.`
    : status.daysLeft !== null && status.daysLeft <= 1
      ? es ? `Tu suscripción vence mañana (${date}).` : `Your subscription is due tomorrow (${date}).`
      : es ? `Tu suscripción vence en ${status.daysLeft} días (${date}).` : `Your subscription is due in ${status.daysLeft} days (${date}).`;
  const Icon = overdue ? AlertTriangle : Clock;
  const tone = overdue ? "border-red-200 bg-red-50 text-red-800" : status.daysLeft !== null && status.daysLeft <= 3 ? "border-orange-200 bg-orange-50 text-orange-800" : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div role={overdue ? "alert" : "status"} className={`mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border px-3 py-2 text-sm ${tone}`}>
      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">{msg}</span>
      <Link href="/portal/settings#facturacion" className="flex-shrink-0 font-medium underline underline-offset-2">{es ? "Ver mi suscripción" : "View my subscription"}</Link>
    </div>
  );
}
