"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { recordOrgPayment, setOrgBillingDueDate } from "@/actions/admin/billing";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";
import { formatDate } from "@/lib/utils";
import type { BillingView } from "@/lib/billing";

const METHODS = { TRANSFER: { es: "Transferencia", en: "Transfer" }, CASH: { es: "Efectivo", en: "Cash" }, OTHER: { es: "Otro", en: "Other" }, STRIPE: { es: "Stripe", en: "Stripe" } } as const;

/** Suscripción de un cliente: vencimiento, estado de pago, registrar pagos (sin Stripe) y fijar la fecha. Todo queda auditado. */
export function BillingAdminPanel({ orgId, view }: { orgId: string; view: BillingView }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(String(view.amountMxn));
  const [method, setMethod] = useState<"TRANSFER" | "CASH" | "OTHER">("TRANSFER");
  const [months, setMonths] = useState("1");
  const [ref, setRef] = useState("");
  const [due, setDue] = useState(view.dueAt ? view.dueAt.toISOString().slice(0, 10) : "");
  const [reason, setReason] = useState("");
  const field = "h-9 w-full rounded-md border border-slate-200 bg-transparent px-2 text-sm";

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        setRef("");
        setReason("");
        router.refresh();
      } catch (e) {
        toast.error(getErrorMessage(e, es ? "No se pudo completar" : "Couldn't complete"));
      }
    });

  const badge =
    view.state === "OVERDUE" ? <Badge variant="destructive">{es ? `Vencido hace ${view.daysOver} d` : `Overdue ${view.daysOver} d`}</Badge>
    : view.state === "DUE_SOON" ? <Badge variant="warning">{es ? `Vence en ${view.daysLeft} d` : `Due in ${view.daysLeft} d`}</Badge>
    : view.state === "ACTIVE" ? <Badge variant="success">{es ? "Al corriente" : "Paid up"}</Badge>
    : <Badge variant="secondary">{es ? "Sin cobro por la plataforma" : "Not billed here"}</Badge>;

  return (
    <Card id="suscripcion" className="lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{es ? "Suscripción" : "Subscription"}</CardTitle>
        <CreditCard className="h-4 w-4 text-slate-400" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {badge}
          <span className="text-slate-600">{es ? "Mensualidad" : "Monthly"}: <strong>${view.amountMxn.toLocaleString("en-US")} MXN</strong></span>
          {view.dueAt && <span className="text-slate-600">{es ? "Pagado hasta" : "Paid through"}: <strong>{formatDate(view.dueAt)}</strong></span>}
          {view.stripeSubscription && <Badge variant="secondary">{es ? "Cobro automático con Stripe" : "Automatic Stripe billing"}</Badge>}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-slate-100 p-3">
            <h4 className="text-sm font-semibold text-slate-900">{es ? "Registrar un pago" : "Record a payment"}</h4>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={es ? "Monto en MXN" : "Amount in MXN"} />
              <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={field} aria-label={es ? "Método" : "Method"}>
                {(["TRANSFER", "CASH", "OTHER"] as const).map((m) => <option key={m} value={m}>{METHODS[m][es ? "es" : "en"]}</option>)}
              </select>
              <Input type="number" min="1" max="24" step="1" value={months} onChange={(e) => setMonths(e.target.value)} aria-label={es ? "Meses que cubre" : "Months covered"} />
            </div>
            <Input placeholder={es ? "Referencia o folio (evita duplicar)" : "Reference (prevents duplicates)"} value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} />
            <Button size="sm" disabled={pending || !(Number(amount) >= 0)} onClick={() => run(() => recordOrgPayment({ orgId, amountMxn: Number(amount), method, months: Number(months) || 1, externalRef: ref || undefined }), es ? "Pago registrado" : "Payment recorded")}>{es ? "Registrar pago" : "Record payment"}</Button>
            <p className="text-xs text-slate-500">{es ? "Recorre el vencimiento los meses indicados (un pago adelantado suma al vencimiento actual)." : "Moves the due date forward by those months (an early payment adds to the current due date)."}</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-100 p-3">
            <h4 className="text-sm font-semibold text-slate-900">{es ? "Fijar vencimiento" : "Set due date"}</h4>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label={es ? "Próximo vencimiento" : "Next due date"} />
            <Input placeholder={es ? "Motivo (queda en la bitácora)" : "Reason (goes to the audit log)"} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} aria-label={es ? "Motivo" : "Reason"} />
            <Button size="sm" variant="outline" disabled={pending || reason.trim().length < 5} onClick={() => run(() => setOrgBillingDueDate({ orgId, dueAt: due || null, reason }), es ? "Vencimiento guardado" : "Due date saved")}>{es ? "Guardar (vacío = sin cobro)" : "Save (empty = not billed)"}</Button>
            <p className="text-xs text-slate-500">{es ? "Da de alta al cliente en el cobro: desde ahí recibe avisos de vencimiento. Nada se suspende solo." : "Enrolls the client in billing: from then on it gets due-date notices. Nothing is suspended automatically."}</p>
          </div>
        </div>

        {view.payments.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {view.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                <span className="font-medium text-slate-900">${p.amountMxn.toLocaleString("en-US")} MXN</span>
                <span className="text-xs text-slate-500">{METHODS[p.method as keyof typeof METHODS]?.[es ? "es" : "en"] ?? p.method}{p.externalRef ? ` · ${p.externalRef}` : ""}</span>
                <span className="text-xs text-slate-500">{es ? "hasta" : "through"} {formatDate(p.periodEnd)}</span>
                <span className="ml-auto text-xs text-slate-400">{formatDate(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
