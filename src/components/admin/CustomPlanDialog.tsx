"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Minus, Plus, Settings2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { PlatformModule } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCustomPlanState, removeCustomPlan, saveCustomPlan, type CustomPlanState } from "@/actions/admin/plans";
import { ALL_MODULES, getModuleLabel } from "@/lib/modules";
import { planName, type PlanDef } from "@/lib/plans";
import { getErrorMessage } from "@/lib/user-error";
import { cn } from "@/lib/utils";

type Limits = CustomPlanState["limits"];
type Form = { orgId: string; basePlan: string; price: string; aiBudget: number; modules: PlatformModule[]; limits: Limits; runs: number | null };

/** Interruptor accesible (sí/no) para encender o apagar un módulo. */
function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-violet-600" : "bg-slate-300 dark:bg-slate-600"
      )}
    >
      <span className={cn("inline-block h-5 w-5 rounded-full bg-white shadow transition-transform", checked ? "translate-x-5" : "translate-x-0.5")} />
    </button>
  );
}

/**
 * Contador con − / + y campo editable. Con `unlimitedLabel`, una casilla deja el valor en null (ilimitado / sin tope).
 * `step` es lo que suma o resta cada botón (leads de 100 en 100, presupuesto de 100 en 100, el resto de 1 en 1).
 */
function Counter({ id, label, value, onChange, step = 1, min = 0, max, unlimitedLabel, prefix }: {
  id: string; label: string; value: number | null; onChange: (v: number | null) => void; step?: number; min?: number; max: number; unlimitedLabel?: string; prefix?: string;
}) {
  const unlimited = value === null;
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const [lastFinite, setLastFinite] = useState(value ?? step);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <div className={cn("flex items-center rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900", unlimited && "opacity-50")}>
          <button type="button" aria-label={`− ${label}`} disabled={unlimited || (value ?? 0) <= min} onClick={() => onChange(clamp((value ?? 0) - step))} className="flex h-9 w-9 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-slate-800">
            <Minus className="h-4 w-4" />
          </button>
          <div className="flex items-center">
            {prefix && <span className="pl-1 text-sm text-slate-500">{prefix}</span>}
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              disabled={unlimited}
              value={unlimited ? "" : value}
              placeholder={unlimited ? "∞" : undefined}
              onChange={(e) => { const n = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(n)) { onChange(clamp(n)); setLastFinite(clamp(n)); } }}
              className="h-9 w-20 border-x border-slate-200 bg-transparent text-center text-sm font-semibold tabular-nums outline-none [appearance:textfield] dark:border-slate-700 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
          </div>
          <button type="button" aria-label={`+ ${label}`} disabled={unlimited || (value ?? 0) >= max} onClick={() => onChange(clamp((value ?? 0) + step))} className="flex h-9 w-9 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:hover:bg-slate-800">
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {unlimitedLabel && (
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={unlimited} onChange={(e) => { if (e.target.checked) { if (value !== null) setLastFinite(value); onChange(null); } else onChange(lastFinite); }} className="h-3.5 w-3.5 accent-violet-600" />
            {unlimitedLabel}
          </label>
        )}
      </div>
    </div>
  );
}

const fromState = (s: CustomPlanState, plans: PlanDef[]): Form => {
  // Un cliente que aún no es «A la medida» arranca con lo que hoy tiene: sus módulos activos y los límites de su plan.
  const base = plans.find((p) => p.key === s.basePlan);
  return { orgId: s.orgId, basePlan: s.basePlan, price: s.priceMxn !== null ? String(s.priceMxn) : base ? String(base.priceMxn) : "", aiBudget: s.aiBudgetMxn, modules: s.modules, limits: s.limits, runs: s.maxAutomationRuns ?? null };
};

/**
 * Admin → Planes → «A la medida» (Custom Service): módulos con interruptores y cantidades con contador, por cliente. Sin
 * `orgId` muestra primero a qué cliente se le da el plan; con `orgId` edita el de ese cliente.
 */
export function CustomPlanDialog({ orgId, clients, plans, lang }: { orgId?: string; clients?: { id: string; name: string; customPlan: boolean }[]; plans: PlanDef[]; lang: "es" | "en" }) {
  const es = lang === "es";
  const router = useRouter();
  const labels = getModuleLabel(lang);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [name, setName] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  function load(id: string) {
    startLoad(async () => {
      try {
        const s = await getCustomPlanState(id);
        setForm(fromState(s, plans));
        setName(s.name);
        setIsCustom(s.customPlan);
      } catch (err) {
        toast.error(getErrorMessage(err, es ? "No se pudo cargar el cliente" : "Couldn't load the client"));
      }
    });
  }

  const setLimit = (k: keyof Limits, v: number | null) => setForm((f) => (f ? { ...f, limits: { ...f.limits, [k]: v } } : f));
  const toggle = (m: PlatformModule, on: boolean) =>
    setForm((f) => {
      if (!f) return f;
      let modules = on ? [...new Set([...f.modules, m])] : f.modules.filter((x) => x !== m);
      // Reymen POS manda sus ventas a Foods: encender POS enciende Foods; apagar Foods apaga POS.
      if (on && m === "REYMEN_POS") modules = [...new Set([...modules, "FOOD_OPS" as PlatformModule])];
      if (!on && m === "FOOD_OPS") modules = modules.filter((x) => x !== "REYMEN_POS");
      return { ...f, modules };
    });
  const startFrom = (key: string) => {
    const p = plans.find((x) => x.key === key);
    if (!p) return;
    setForm((f) => (f ? { ...f, basePlan: key, runs: p.maxAutomationRuns ?? null, modules: p.modules, aiBudget: p.aiBudgetMxn, limits: { leads: p.limits.leads, users: p.limits.users, automations: p.limits.automations, aiAgents: p.maxAiAgents } } : f));
  };

  const price = form ? Number(form.price) : NaN;
  const priceInvalid = !(price > 0);

  function save() {
    if (!form || priceInvalid) return;
    startSave(async () => {
      try {
        const r = await saveCustomPlan({ orgId: form.orgId, basePlan: form.basePlan, priceMxn: price, aiBudgetMxn: form.aiBudget, modules: form.modules, limits: form.limits, maxAutomationRuns: form.runs });
        if (r.stripeSync === "pending") toast.warning(es ? "Precio guardado. Sincronización con Stripe pendiente; se reintentará automáticamente." : "Price saved. Stripe sync is pending and will be retried automatically.");
        toast.success(es ? `${name}: plan A la medida guardado${r.modulesChanged ? ` · ${r.modulesChanged} módulo(s) actualizados` : ""}` : `${name}: Custom Service plan saved${r.modulesChanged ? ` · ${r.modulesChanged} module(s) updated` : ""}`);
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(getErrorMessage(err, es ? "No se pudo guardar" : "Couldn't save"));
      }
    });
  }

  function remove() {
    if (!form) return;
    if (!confirm(es ? `¿Quitar A la medida a ${name}? Vuelve a su plan base con su precio de lista y sus límites. Sus módulos contratados se ajustarán al plan base; se conservarán las excepciones administrativas.` : `Remove Custom Service from ${name}? It goes back to its base plan's list price and limits. Subscribed modules will match the base plan; administrative overrides will be preserved.`)) return;
    startSave(async () => {
      try {
        await removeCustomPlan(form.orgId);
        toast.success(es ? "Volvió a su plan base" : "Back on its base plan");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(getErrorMessage(err, es ? "No se pudo quitar" : "Couldn't remove"));
      }
    });
  }

  // Cantidades que dependen de un módulo: aparecen bajo su interruptor y solo si está encendido.
  const moduleCounters: Partial<Record<PlatformModule, React.ReactNode>> = form
    ? {
        CRM: <Counter id="cp-leads" label={es ? "Leads (contactos)" : "Leads (contacts)"} value={form.limits.leads} onChange={(v) => setLimit("leads", v)} step={100} max={10_000_000} unlimitedLabel={es ? "Ilimitados" : "Unlimited"} />,
        AI_WHATSAPP: (
          <div className="grid gap-3 sm:grid-cols-2">
            <Counter id="cp-agents" label={es ? "Agentes IA activos" : "Active AI agents"} value={form.limits.aiAgents} onChange={(v) => setLimit("aiAgents", v)} max={100} unlimitedLabel={es ? "Sin tope" : "No cap"} />
            <Counter id="cp-ai" label={es ? "Presupuesto de IA (MXN/mes)" : "AI budget (MXN/mo)"} value={form.aiBudget} onChange={(v) => setForm((f) => (f ? { ...f, aiBudget: v ?? 0 } : f))} step={100} max={1_000_000} prefix="$" />
          </div>
        ),
        AUTOMATIONS: <div className="space-y-3"><Counter id="cp-runs" label={es ? "Ejecuciones mensuales" : "Monthly executions"} value={form.runs} onChange={v => setForm(f => f ? { ...f, runs: v } : f)} max={10_000_000} unlimitedLabel={es ? "Sin tope" : "Unlimited"} /><Counter id="cp-auto" label={es ? "Automatizaciones" : "Automations"} value={form.limits.automations} onChange={(v) => setLimit("automations", v)} max={10_000} unlimitedLabel={es ? "Ilimitadas" : "Unlimited"} /></div>,
      }
    : {};

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && orgId) load(orgId); if (!o) { setForm(null); setName(""); } }}>
      <DialogTrigger asChild>
        {orgId ? (
          <Button size="sm" variant="outline"><Settings2 className="h-3.5 w-3.5" /> {es ? "Configurar" : "Configure"}</Button>
        ) : (
          <Button size="sm" className="bg-violet-600 text-white hover:bg-violet-700"><Plus className="h-4 w-4" /> {es ? "Agregar cliente" : "Add client"}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" /> {es ? "A la medida" : "Custom Service"}{name ? ` · ${name}` : ""}
          </DialogTitle>
          <DialogDescription>
            {es
              ? "Enciende los módulos que contrata este cliente y ajusta cuántos usuarios, leads, automatizaciones y agentes IA incluye. Al guardar se aplica de inmediato; nunca se borran datos ni se apagan agentes ya activos."
              : "Turn on the modules this client buys and set how many users, leads, automations and AI agents it includes. Saving applies immediately; no data is deleted and active agents are never turned off."}
          </DialogDescription>
        </DialogHeader>

        {!orgId && !form && (
          <div className="space-y-1">
            <Label htmlFor="cp-client">{es ? "Cliente" : "Client"}</Label>
            <select id="cp-client" defaultValue="" disabled={loading} onChange={(e) => e.target.value && load(e.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
              <option value="" disabled>{es ? "Elige un cliente…" : "Choose a client…"}</option>
              {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.customPlan ? (es ? " (ya es A la medida)" : " (already Custom Service)") : ""}</option>)}
            </select>
          </div>
        )}

        {loading && <p className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {es ? "Cargando…" : "Loading…"}</p>}

        {form && !loading && (
          <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cp-price">{es ? "Precio mensual pactado (MXN)" : "Agreed monthly price (MXN)"}</Label>
                <Input id="cp-price" type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} aria-invalid={priceInvalid} />
                <p className="text-xs text-slate-500">{es ? "Stripe cobrará este importe mensual. En suscripciones existentes, cambia desde la siguiente renovación, sin prorrateos." : "Stripe charges this monthly amount. Existing subscriptions change on their next renewal, without proration."}</p>
                {priceInvalid && <p className="text-xs text-red-600">{es ? "Debe ser mayor a 0." : "Must be greater than 0."}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="cp-base">{es ? "Plan base (referencia de facturación)" : "Base plan (billing reference)"}</Label>
                <div className="flex gap-2">
                  <select id="cp-base" value={form.basePlan} onChange={(e) => setForm({ ...form, basePlan: e.target.value })} className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                    {plans.filter((p) => p.isActive || p.key === form.basePlan).map((p) => <option key={p.key} value={p.key}>{planName(p, lang)}</option>)}
                  </select>
                  <Button type="button" size="sm" variant="outline" onClick={() => startFrom(form.basePlan)} title={es ? "Copia módulos y cantidades de este plan" : "Copies this plan's modules and quantities"}>{es ? "Partir de este plan" : "Start from plan"}</Button>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{es ? "Equipo" : "Team"}</h3>
              <Counter id="cp-users" label={es ? "Usuarios del portal" : "Portal users"} value={form.limits.users} onChange={(v) => setLimit("users", v)} max={10_000} unlimitedLabel={es ? "Ilimitados" : "Unlimited"} />
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{es ? "Módulos" : "Modules"}</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
                {ALL_MODULES.map((m) => {
                  const on = form.modules.includes(m);
                  return (
                    <li key={m} className="space-y-3 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className={cn("text-sm", on ? "font-medium text-slate-900" : "text-slate-500")}>{labels[m]}</span>
                        <Switch checked={on} onChange={(v) => toggle(m, v)} label={labels[m]} />
                      </div>
                      {on && moduleCounters[m] && <div className="rounded-md bg-violet-50/50 p-2.5 dark:bg-violet-950/20">{moduleCounters[m]}</div>}
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-slate-500">{es ? "Apagar un módulo lo cancela para este cliente; su información se conserva y se puede volver a encender." : "Turning a module off cancels it for this client; its data is kept and it can be turned back on."}</p>
            </section>
          </div>
        )}

        {form && !loading && (
          <DialogFooter className="gap-2 sm:justify-between">
            {isCustom ? (
              <Button type="button" variant="ghost" className="text-red-600 hover:text-red-700" disabled={saving} onClick={remove}>{es ? "Quitar A la medida" : "Remove Custom Service"}</Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{es ? "Cancelar" : "Cancel"}</Button>
              <Button type="button" onClick={save} disabled={saving || priceInvalid} className="bg-violet-600 text-white hover:bg-violet-700">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} {es ? "Guardar" : "Save"}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
