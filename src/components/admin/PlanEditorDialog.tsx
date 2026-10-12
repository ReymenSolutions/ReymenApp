"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createPlan, updatePlan, type PlanRow } from "@/actions/admin/plans";
import { getModuleLabel } from "@/lib/modules";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";
import type { PlatformModule } from "@prisma/client";
import { ACCENT_TONES, PLAN_ACCENTS, type PlanAccent } from "@/lib/plan-accent";

const MODULES: PlatformModule[] = ["CRM", "AI_WHATSAPP", "AUTOMATIONS", "FOOD_OPS", "REYMEN_POS", "NFC_QR", "MARKETING_ADS"];

type Form = {
  key: string; name: string; nameEn: string; description: string; descriptionEn: string; priceMxn: string;
  leads: string; users: string; automations: string; aiBudgetMxn: string; aiAgents: string;
  modules: PlatformModule[]; features: { es: string; en: string }[]; stripePriceId: string; accent: PlanAccent; sortOrder: string; isActive: boolean;
};

const EMPTY: Form = { key: "", name: "", nameEn: "", description: "", descriptionEn: "", priceMxn: "", leads: "", users: "", automations: "", aiBudgetMxn: "", aiAgents: "", modules: ["CRM"], features: [], stripePriceId: "", accent: "slate", sortOrder: "10", isActive: true };

const fromPlan = (p: PlanRow): Form => ({
  key: p.key, name: p.name, nameEn: p.nameEn, description: p.description, descriptionEn: p.descriptionEn, priceMxn: String(p.priceMxn),
  leads: p.limits.leads === null ? "" : String(p.limits.leads), users: p.limits.users === null ? "" : String(p.limits.users), automations: p.limits.automations === null ? "" : String(p.limits.automations),
  aiBudgetMxn: String(p.aiBudgetMxn), aiAgents: p.maxAiAgents === null ? "" : String(p.maxAiAgents), modules: p.modules, features: p.features.map((f) => ({ ...f })),
  stripePriceId: p.stripePriceId ?? "", accent: (PLAN_ACCENTS as readonly string[]).includes(p.accent) ? (p.accent as PlanAccent) : "slate", sortOrder: String(p.sortOrder), isActive: p.isActive,
});

/** Alta y edición de un plan: nombre, precio, límites, presupuesto de IA, módulos y "qué incluye". Aplica a todo lo conectado al guardar. */
export function PlanEditorDialog({ plan }: { plan?: PlanRow }) {
  const { lang } = usePreferences();
  const es = lang !== "en";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(plan ? fromPlan(plan) : EMPTY);
  const [pending, start] = useTransition();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const moduleLabel = getModuleLabel(es ? "es" : "en");

  /** Límite numérico con la opción "Ilimitado" (campo vacío = ilimitado). */
  const limitField = (k: "leads" | "users" | "automations" | "aiAgents", label: string, unlimitedLabel: string) => (
    <div className="space-y-1">
      <Label htmlFor={`plan-${k}`}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={`plan-${k}`} type="number" min="0" step="1" value={form[k]} disabled={form[k] === ""} onChange={(e) => set(k, e.target.value)} className="w-28" />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={form[k] === ""} onChange={(e) => set(k, e.target.checked ? "" : "1")} /> {unlimitedLabel}
        </label>
      </div>
    </div>
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        const body = {
          name: form.name, nameEn: form.nameEn || form.name, description: form.description, descriptionEn: form.descriptionEn,
          priceMxn: form.priceMxn, maxLeads: form.leads, maxUsers: form.users, maxAutomations: form.automations, aiBudgetMxn: form.aiBudgetMxn, maxAiAgents: form.aiAgents,
          modules: form.modules, features: form.features.filter((f) => f.es.trim()).map((f) => ({ es: f.es, en: f.en.trim() || f.es })),
          stripePriceId: form.stripePriceId || null, accent: form.accent, sortOrder: form.sortOrder, isActive: form.isActive,
        };
        if (plan) await updatePlan(plan.key, body as never);
        else await createPlan({ ...body, key: form.key } as never);
        toast.success(plan ? (es ? "Plan actualizado en todo el sistema" : "Plan updated everywhere") : es ? "Plan creado" : "Plan created");
        setOpen(false);
        if (!plan) setForm(EMPTY);
        router.refresh();
      } catch (err) {
        toast.error(getErrorMessage(err, es ? "No se pudo guardar el plan" : "Couldn't save the plan"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && plan) setForm(fromPlan(plan)); }}>
      <DialogTrigger asChild>
        {plan ? (
          <Button size="sm" variant="outline"><Pencil className="h-3.5 w-3.5" /> {es ? "Editar" : "Edit"}</Button>
        ) : (
          <Button size="sm"><Plus className="h-4 w-4" /> {es ? "Nuevo plan" : "New plan"}</Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? `${es ? "Editar plan" : "Edit plan"}: ${plan.name}` : es ? "Nuevo plan" : "New plan"}</DialogTitle>
          <DialogDescription>
            {plan
              ? es ? `Al guardar, el cambio aplica de inmediato a los ${plan.clients} cliente(s) de este plan y a todo lo que lo muestra o lo usa. Los precios pactados con un cliente no se tocan.` : `On save, the change applies immediately to this plan's ${plan.clients} client(s) and everything that shows or uses it. Prices agreed with a client are untouched.`
              : es ? "Un plan nuevo no cambia a ningún cliente existente." : "A new plan changes no existing client."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          {!plan && (
            <div className="space-y-1">
              <Label htmlFor="plan-key">{es ? "Llave (no se puede cambiar después)" : "Key (cannot be changed later)"}</Label>
              <Input id="plan-key" value={form.key} onChange={(e) => set("key", e.target.value.toLowerCase())} placeholder="premium" required pattern="[a-z][a-z0-9_-]{1,29}" />
            </div>
          )}

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="plan-name">{es ? "Nombre (español)" : "Name (Spanish)"}</Label><Input id="plan-name" value={form.name} onChange={(e) => set("name", e.target.value)} required maxLength={40} /></div>
            <div className="space-y-1"><Label htmlFor="plan-nameEn">{es ? "Nombre (inglés)" : "Name (English)"}</Label><Input id="plan-nameEn" value={form.nameEn} onChange={(e) => set("nameEn", e.target.value)} maxLength={40} /></div>
            <div className="space-y-1"><Label htmlFor="plan-desc">{es ? "Descripción (español)" : "Description (Spanish)"}</Label><Input id="plan-desc" value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={300} /></div>
            <div className="space-y-1"><Label htmlFor="plan-descEn">{es ? "Descripción (inglés)" : "Description (English)"}</Label><Input id="plan-descEn" value={form.descriptionEn} onChange={(e) => set("descriptionEn", e.target.value)} maxLength={300} /></div>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1"><Label htmlFor="plan-price">{es ? "Precio mensual (MXN)" : "Monthly price (MXN)"}</Label><Input id="plan-price" type="number" min="0" step="0.01" value={form.priceMxn} onChange={(e) => set("priceMxn", e.target.value)} required /></div>
            <div className="space-y-1"><Label htmlFor="plan-ai">{es ? "Presupuesto interno de IA (MXN/mes)" : "Internal AI budget (MXN/mo)"}</Label><Input id="plan-ai" type="number" min="0" step="0.01" value={form.aiBudgetMxn} onChange={(e) => set("aiBudgetMxn", e.target.value)} required /></div>
            <div className="space-y-1"><Label htmlFor="plan-order">{es ? "Orden" : "Order"}</Label><Input id="plan-order" type="number" min="0" step="1" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} /></div>
            {limitField("leads", es ? "Leads" : "Leads", es ? "Ilimitado" : "Unlimited")}
            {limitField("users", es ? "Usuarios" : "Users", es ? "Ilimitado" : "Unlimited")}
            {limitField("automations", es ? "Automatizaciones" : "Automations", es ? "Ilimitadas" : "Unlimited")}
            {limitField("aiAgents", es ? "Agentes IA activos" : "Active AI agents", es ? "Sin tope" : "No cap")}
          </section>

          <section className="space-y-2">
            <Label id="plan-accent-label">{es ? "Color del plan (sutil, para diferenciarlo)" : "Plan color (subtle, to tell plans apart)"}</Label>
            <div role="radiogroup" aria-labelledby="plan-accent-label" className="flex flex-wrap gap-2">
              {PLAN_ACCENTS.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={form.accent === a} aria-label={ACCENT_TONES[a].label[es ? "es" : "en"]} title={ACCENT_TONES[a].label[es ? "es" : "en"]} onClick={() => set("accent", a)}
                  className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors ${form.accent === a ? `${ACCENT_TONES[a].border} ${ACCENT_TONES[a].badge}` : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  <span className={`h-3 w-3 rounded-full ${ACCENT_TONES[a].swatch}`} />{ACCENT_TONES[a].label[es ? "es" : "en"]}
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <Label>{es ? "Módulos que incluye" : "Modules included"}</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {MODULES.map((m) => (
                <label key={m} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="checkbox" checked={form.modules.includes(m)} onChange={(e) => set("modules", e.target.checked ? [...form.modules, m] : form.modules.filter((x) => x !== m))} /> {moduleLabel[m]}
                </label>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{es ? "Qué incluye (lo que ve el cliente)" : "What it includes (what the client sees)"}</Label>
              <Button type="button" size="sm" variant="outline" disabled={form.features.length >= 14} onClick={() => set("features", [...form.features, { es: "", en: "" }])}><Plus className="h-3.5 w-3.5" /> {es ? "Agregar línea" : "Add line"}</Button>
            </div>
            {form.features.length === 0 && <p className="text-xs text-slate-400">{es ? "Sin líneas todavía." : "No lines yet."}</p>}
            {form.features.map((f, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <Input aria-label={`${es ? "Texto en español" : "Spanish text"} ${i + 1}`} placeholder={es ? "Español" : "Spanish"} value={f.es} onChange={(e) => set("features", form.features.map((x, j) => (j === i ? { ...x, es: e.target.value } : x)))} maxLength={120} />
                <Input aria-label={`${es ? "Texto en inglés" : "English text"} ${i + 1}`} placeholder={es ? "Inglés" : "English"} value={f.en} onChange={(e) => set("features", form.features.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)))} maxLength={120} />
                <Button type="button" size="sm" variant="ghost" aria-label={es ? "Quitar línea" : "Remove line"} onClick={() => set("features", form.features.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="plan-stripe">{es ? "Precio de Stripe (opcional)" : "Stripe price (optional)"}</Label>
              <Input id="plan-stripe" value={form.stripePriceId} onChange={(e) => set("stripePriceId", e.target.value)} placeholder="price_…" maxLength={120} />
              <p className="text-xs text-slate-500">{es ? "Vacío = se toma de la variable STRIPE_PRICE_<LLAVE>." : "Empty = taken from the STRIPE_PRICE_<KEY> variable."}</p>
            </div>
            <label className="flex items-start gap-2 pt-6 text-sm text-slate-700">
              <input type="checkbox" className="mt-1" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
              <span>{es ? "Plan activo (se puede asignar a clientes). Si lo retiras, quienes ya lo tienen lo conservan." : "Active plan (can be assigned to clients). If retired, those who already have it keep it."}</span>
            </label>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>{es ? "Cancelar" : "Cancel"}</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{es ? "Guardar" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
