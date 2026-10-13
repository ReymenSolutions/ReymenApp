import { Badge } from "@/components/ui/badge";
import type { BillingView } from "@/lib/billing";
import { formatDate } from "@/lib/utils";

const METHOD = { STRIPE: { es: "Tarjeta (Stripe)", en: "Card (Stripe)" }, TRANSFER: { es: "Transferencia", en: "Transfer" }, CASH: { es: "Efectivo", en: "Cash" }, OTHER: { es: "Otro", en: "Other" } } as const;

/** Estado de la suscripción en Configuración: vencimiento, mensualidad y últimos pagos. Sin vencimiento fijado no muestra nada. */
export function SubscriptionStatus({ view, lang }: { view: BillingView; lang: string }) {
  if (view.state === "NONE" || !view.dueAt) return null;
  const es = lang !== "en";
  const badge =
    view.state === "OVERDUE" ? <Badge variant="destructive">{es ? "Vencida" : "Overdue"}</Badge>
    : view.state === "DUE_SOON" ? <Badge variant="warning">{es ? "Por vencer" : "Due soon"}</Badge>
    : <Badge variant="success">{es ? "Al corriente" : "Paid up"}</Badge>;
  return (
    <div id="facturacion" className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{es ? "Mi suscripción" : "My subscription"}</p>
        {badge}
      </div>
      <p className="text-sm text-slate-600">
        {view.state === "OVERDUE"
          ? es ? `Venció el ${formatDate(view.dueAt, lang)} (${view.daysOver} ${view.daysOver === 1 ? "día" : "días"} de atraso).` : `Expired on ${formatDate(view.dueAt, lang)} (${view.daysOver} day${view.daysOver === 1 ? "" : "s"} overdue).`
          : es ? `Pagada hasta el ${formatDate(view.dueAt, lang)}.` : `Paid through ${formatDate(view.dueAt, lang)}.`}{" "}
        {es ? "Mensualidad" : "Monthly"}: ${view.amountMxn.toLocaleString("en-US")} MXN.
      </p>
      {view.state !== "ACTIVE" && !view.stripeSubscription && (
        <p className="text-xs text-slate-500">{es ? "Para pagar, realiza tu transferencia y avísanos desde Solicitudes: registramos tu pago y se actualiza tu vencimiento." : "To pay, make your transfer and let us know from Requests: we record your payment and your due date updates."}</p>
      )}
      {view.payments.length > 0 && (
        <ul className="divide-y divide-slate-100 text-xs text-slate-600">
          {view.payments.slice(0, 3).map((p) => (
            <li key={p.id} className="flex justify-between gap-2 py-1">
              <span>{formatDate(p.createdAt, lang)} · {METHOD[p.method as keyof typeof METHOD]?.[es ? "es" : "en"] ?? p.method}</span>
              <span className="font-medium text-slate-900">${p.amountMxn.toLocaleString("en-US")} MXN</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
