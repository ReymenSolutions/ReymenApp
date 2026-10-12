"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cpu, Loader2, PauseCircle, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { creditOrgAiBudget, extendOrgAiBudget, resetOrgAiBudget, setOrgAiBudget, setOrgAiBudgetPolicy, setOrgAgentsCap, type OrgAiBudgetView } from "@/actions/admin/ai-budget";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";
import { formatDateTime, formatMoney } from "@/lib/utils";

const TYPE_LABEL: Record<string, { es: string; en: string }> = { EXTEND: { es: "Ampliación", en: "Extension" }, RESET: { es: "Restablecimiento", en: "Reset" }, TOPUP: { es: "Recarga", en: "Top-up" }, CREDIT: { es: "Crédito / ajuste", en: "Credit / adjustment" } };
const STATUS_TONE = { OK: "bg-emerald-500", WARN_50: "bg-emerald-500", WARN_75: "bg-amber-500", CRITICAL_90: "bg-orange-500", EXHAUSTED: "bg-red-500" } as const;

/** Presupuesto de IA de un cliente: consumo del ciclo, estado de sus agentes y acciones auditadas (ampliar, restablecer, fijar, política). */
export function AiBudgetPanel({ orgId, view, providers }: { orgId: string; view: OrgAiBudgetView; providers: string[] }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [monthly, setMonthly] = useState(view.state.source === "setting" ? String(view.state.baseMxn) : "");
  const [policy, setPolicy] = useState({ policy: view.state.policy as "BLOCK" | "DEGRADE", provider: view.state.fallback?.provider ?? providers[0] ?? "anthropic", model: view.state.fallback?.model ?? "", cap: view.state.degradeCapMxn ? String(view.state.degradeCapMxn) : "" });
  const [capText, setCapText] = useState(view.agentCap.source === "override" && view.agentCap.cap !== null ? String(view.agentCap.cap) : "");
  const s = view.state;
  const ac = view.agentCap;

  const run = (fn: () => Promise<unknown>, ok: string) =>
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        setAmountText("");
        setReason("");
        router.refresh();
      } catch (e) {
        toast.error(getErrorMessage(e, es ? "No se pudo completar" : "Couldn't complete"));
      }
    });
  const num = Number(amountText);
  const field = "h-9 w-full rounded-md border border-slate-200 bg-transparent px-2 text-sm";

  return (
    <Card id="ia-presupuesto" className="lg:col-span-2">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{es ? "Presupuesto de IA" : "AI budget"}</CardTitle>
        <Cpu className="h-4 w-4 text-slate-400" />
      </CardHeader>
      <CardContent className="space-y-5">
        {view.blocked && (
          <p role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <PauseCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            {es ? "Los agentes de IA de este cliente están en pausa por presupuesto agotado (BUDGET_EXHAUSTED). Es temporal: se reanudan al renovarse el ciclo, al ampliar o restablecer el presupuesto, o con una recarga. Su configuración y conversaciones no se tocan." : "This client's AI agents are paused because the budget is exhausted (BUDGET_EXHAUSTED). It is temporary: they resume when the cycle renews, when the budget is extended or reset, or with a top-up. Their settings and conversations are untouched."}
          </p>
        )}

        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-medium text-slate-900">${formatMoney(s.spentMxn).replace("$", "")} / ${formatMoney(s.availableMxn).replace("$", "")} MXN <span className="font-normal text-slate-500">({Math.min(999, Math.round(s.percent))} %)</span></span>
            <span className="text-xs text-slate-500">{es ? "Ciclo" : "Cycle"}: {s.cycleStart.toISOString().slice(0, 10)} → {s.cycleEnd.toISOString().slice(0, 10)}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.min(100, Math.round(s.percent))} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full ${STATUS_TONE[s.status]}`} style={{ width: `${Math.min(100, s.percent)}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {es ? "Base" : "Base"} ${formatMoney(s.baseMxn).replace("$", "")} ({s.source === "setting" ? (es ? "fijado para este cliente" : "set for this client") : es ? "predeterminado de su plan" : "its plan's default"}) · {es ? "ajustes" : "adjustments"} {s.adjustmentsMxn >= 0 ? "+" : ""}${formatMoney(s.adjustmentsMxn).replace("$", "")} · {es ? "reservado en curso" : "reserved in flight"} ${formatMoney(s.reservedMxn).replace("$", "")} · {es ? "restante" : "remaining"} ${formatMoney(Math.max(0, s.remainingMxn)).replace("$", "")} · {es ? "política al 100 %" : "policy at 100%"}: {s.policy === "BLOCK" ? (es ? "bloquear" : "block") : `${es ? "modelo económico" : "economy model"} ${s.fallback?.model ?? ""} (${es ? "tope extra" : "extra cap"} $${s.degradeCapMxn})`}
          </p>
          {view.alerts.length > 0 && <p className="mt-1 text-xs text-slate-500">{es ? "Alertas emitidas este ciclo" : "Alerts sent this cycle"}: {view.alerts.map((a) => `${a.threshold} %`).join(", ")}</p>}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-900">{es ? "Agentes" : "Agents"}</h4>
          <p className={`mb-2 text-xs ${ac.overBy > 0 ? "font-medium text-amber-700" : "text-slate-500"}`}>
            {es ? "Agentes IA activos" : "Active AI agents"}: {ac.active} / {ac.cap === null ? (es ? "sin tope" : "no cap") : ac.cap} ({ac.source === "override" ? (es ? "tope pactado con el cliente" : "cap agreed with the client") : es ? "tope de su plan" : "its plan's cap"})
            {ac.overBy > 0 && ` · ${es ? `por encima del tope (+${ac.overBy}); conserva lo que tiene pero no puede activar más` : `over the cap (+${ac.overBy}); keeps what it has but cannot turn more on`}`}
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {view.agents.map((a) => (
              <li key={a.agentKey} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-slate-900">{a.label} {a.configuredMode && <span className="font-normal text-slate-500">· {a.configuredMode}</span>}</span>
                {a.runtime === "ACTIVE" && <Badge variant="success" className="text-[10px]">{es ? "Activo" : "Active"}</Badge>}
                {a.runtime === "OFF_MANUAL" && <Badge variant="secondary" className="gap-1 text-[10px]"><PowerOff className="h-3 w-3" />{es ? "Desactivado manualmente" : "Manually off"}</Badge>}
                {a.runtime === "BUDGET_EXHAUSTED" && <Badge variant="destructive" className="gap-1 text-[10px]"><PauseCircle className="h-3 w-3" />{es ? "Bloqueado por presupuesto" : "Blocked by budget"}</Badge>}
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 rounded-lg border border-slate-100 p-3">
          <h4 className="text-sm font-semibold text-slate-900">{es ? "Tope de agentes IA (excepción para este cliente)" : "AI agents cap (exception for this client)"}</h4>
          <div className="flex flex-wrap gap-2">
            <Input type="number" min="0" max="100" step="1" className="w-40" placeholder={es ? "Vacío = el de su plan" : "Empty = its plan's"} value={capText} onChange={(e) => setCapText(e.target.value)} aria-label={es ? "Tope de agentes IA" : "AI agents cap"} />
            <Input className="min-w-[12rem] flex-1" placeholder={es ? "Motivo (queda en la bitácora)" : "Reason (goes to the audit log)"} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} aria-label={es ? "Motivo" : "Reason"} />
            <Button size="sm" disabled={pending || reason.trim().length < 5} onClick={() => run(() => setOrgAgentsCap({ orgId, cap: capText.trim() === "" ? null : Number(capText), reason }), es ? "Tope guardado" : "Cap saved")}>{es ? "Guardar tope" : "Save cap"}</Button>
          </div>
          <p className="text-xs text-slate-500">{es ? "Reemplaza el tope del plan solo para este cliente. Nunca apaga agentes: si queda por debajo de los activos, conserva lo que tiene pero no puede activar más." : "Replaces the plan's cap for this client only. It never turns agents off: if it ends below the active ones, the client keeps what it has but cannot turn more on."}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-lg border border-slate-100 p-3">
            <h4 className="text-sm font-semibold text-slate-900">{es ? "Ampliar, restablecer o ajustar" : "Extend, reset or adjust"}</h4>
            <Input type="number" min="0" step="0.01" placeholder={es ? "Monto en MXN" : "Amount in MXN"} value={amountText} onChange={(e) => setAmountText(e.target.value)} aria-label={es ? "Monto en MXN" : "Amount in MXN"} />
            <Input placeholder={es ? "Motivo (queda en la bitácora)" : "Reason (goes to the audit log)"} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} aria-label={es ? "Motivo" : "Reason"} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={pending || !(num > 0) || reason.trim().length < 5} onClick={() => run(() => extendOrgAiBudget({ orgId, amountMxn: num, reason }), es ? "Presupuesto ampliado" : "Budget extended")}>{es ? "Ampliar" : "Extend"}</Button>
              <Button size="sm" variant="outline" disabled={pending || !num || reason.trim().length < 5} onClick={() => run(() => creditOrgAiBudget({ orgId, amountMxn: num, reason }), es ? "Ajuste registrado" : "Adjustment recorded")}>{es ? "Ajuste (+/−)" : "Adjust (+/−)"}</Button>
              <Button size="sm" variant="outline" disabled={pending || reason.trim().length < 5} onClick={() => run(() => resetOrgAiBudget({ orgId, reason }), es ? "Presupuesto restablecido" : "Budget reset")}>{es ? "Restablecer" : "Reset"}</Button>
            </div>
            <p className="text-xs text-slate-500">{es ? "Todo queda como un asiento auditado y no borra el consumo ya registrado." : "Everything is recorded as an audited entry and does not erase recorded usage."}</p>
          </div>

          <div className="space-y-2 rounded-lg border border-slate-100 p-3">
            <h4 className="text-sm font-semibold text-slate-900">{es ? "Presupuesto mensual y política" : "Monthly budget and policy"}</h4>
            <div className="flex gap-2">
              <Input type="number" min="0" step="0.01" placeholder={es ? "Vacío = el de su plan" : "Empty = its plan's"} value={monthly} onChange={(e) => setMonthly(e.target.value)} aria-label={es ? "Presupuesto mensual (MXN)" : "Monthly budget (MXN)"} />
              <Button size="sm" disabled={pending} onClick={() => run(() => setOrgAiBudget({ orgId, monthlyBudgetMxn: monthly.trim() === "" ? null : Number(monthly) }), es ? "Presupuesto guardado" : "Budget saved")}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : es ? "Guardar" : "Save"}</Button>
            </div>
            <select value={policy.policy} onChange={(e) => setPolicy((p) => ({ ...p, policy: e.target.value as "BLOCK" | "DEGRADE" }))} className={field} aria-label={es ? "Política al llegar al 100 %" : "Policy at 100%"}>
              <option value="BLOCK">{es ? "Bloquear (predeterminada)" : "Block (default)"}</option>
              <option value="DEGRADE">{es ? "Usar un modelo económico, con tope (autorizado)" : "Use an economy model, capped (authorized)"}</option>
            </select>
            {policy.policy === "DEGRADE" && (
              <div className="grid gap-2 sm:grid-cols-3">
                <select value={policy.provider} onChange={(e) => setPolicy((p) => ({ ...p, provider: e.target.value }))} className={field} aria-label={es ? "Proveedor" : "Provider"}>
                  {providers.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <Input placeholder={es ? "Modelo" : "Model"} value={policy.model} onChange={(e) => setPolicy((p) => ({ ...p, model: e.target.value }))} aria-label={es ? "Modelo económico" : "Economy model"} />
                <Input type="number" min="0" step="0.01" placeholder={es ? "Tope extra MXN" : "Extra cap MXN"} value={policy.cap} onChange={(e) => setPolicy((p) => ({ ...p, cap: e.target.value }))} aria-label={es ? "Tope extra (MXN)" : "Extra cap (MXN)"} />
              </div>
            )}
            <Button size="sm" variant="outline" disabled={pending || (policy.policy === "DEGRADE" && (!policy.model || !(Number(policy.cap) > 0)))} onClick={() => run(() => setOrgAiBudgetPolicy({ orgId, policy: policy.policy, provider: policy.provider, model: policy.model, capMxn: Number(policy.cap) }), es ? "Política guardada" : "Policy saved")}>{es ? "Guardar política" : "Save policy"}</Button>
          </div>
        </div>

        {view.adjustments.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-900">{es ? "Historial de ajustes" : "Adjustment history"}</h4>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {view.adjustments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                  <span className="min-w-[8rem] font-medium text-slate-900">{TYPE_LABEL[a.type]?.[es ? "es" : "en"] ?? a.type}</span>
                  <span className={a.amountMxn < 0 ? "text-red-600" : "text-emerald-700"}>{a.amountMxn >= 0 ? "+" : ""}${formatMoney(a.amountMxn).replace("$", "")} MXN</span>
                  <span className="min-w-[10rem] flex-1 text-xs text-slate-500">{a.reason}{a.externalRef ? ` · ${a.externalRef}` : ""}</span>
                  <span className="text-xs text-slate-400">{a.createdBy ?? (es ? "sistema" : "system")} · {formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
