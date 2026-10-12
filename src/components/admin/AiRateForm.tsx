"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAiRate } from "@/actions/admin/ai-usage";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";

const EMPTY = { provider: "anthropic", model: "", currency: "USD", inputPerMTok: "", outputPerMTok: "", cacheReadPerMTok: "", cacheWritePerMTok: "", reasoningPerMTok: "", effectiveFrom: "", source: "" };

/** Alta de una tarifa de modelo (precio por millón de tokens, con su vigencia y de dónde sale). */
export function AiRateForm({ providers }: { providers: string[] }) {
  const { lang } = usePreferences();
  const es = lang === "es";
  const [form, setForm] = useState(EMPTY);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      try {
        await createAiRate(form as never);
        toast.success(es ? "Tarifa agregada" : "Rate added");
        setForm(EMPTY);
      } catch (err) {
        toast.error(getErrorMessage(err, es ? "No se pudo guardar la tarifa" : "Couldn't save the rate"));
      }
    });
  }

  const field = "h-9 w-full rounded-md border border-slate-200 bg-transparent px-2 text-sm";
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="rate-provider">{es ? "Proveedor" : "Provider"}</Label>
          <select id="rate-provider" value={form.provider} onChange={set("provider")} className={field}>
            {providers.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rate-model">{es ? "Modelo (tal como se llama en la API)" : "Model (as named in the API)"}</Label>
          <Input id="rate-model" value={form.model} onChange={set("model")} required maxLength={120} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rate-currency">{es ? "Moneda" : "Currency"}</Label>
          <select id="rate-currency" value={form.currency} onChange={set("currency")} className={field}>
            <option value="USD">USD</option>
            <option value="MXN">MXN</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="rate-from">{es ? "Vigente desde" : "Effective from"}</Label>
          <Input id="rate-from" type="date" value={form.effectiveFrom} onChange={set("effectiveFrom")} required />
        </div>
        {([
          ["inputPerMTok", es ? "Entrada (por millón de tokens)" : "Input (per million tokens)", true],
          ["outputPerMTok", es ? "Salida (por millón)" : "Output (per million)", true],
          ["cacheReadPerMTok", es ? "Lectura de caché (opcional)" : "Cache read (optional)", false],
          ["cacheWritePerMTok", es ? "Escritura de caché (opcional)" : "Cache write (optional)", false],
          ["reasoningPerMTok", es ? "Razonamiento (opcional)" : "Reasoning (optional)", false],
        ] as const).map(([key, label, required]) => (
          <div key={key} className="space-y-1">
            <Label htmlFor={`rate-${key}`}>{label}</Label>
            <Input id={`rate-${key}`} type="number" min="0" step="0.000001" value={form[key]} onChange={set(key)} required={required} />
          </div>
        ))}
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="rate-source">{es ? "Fuente (de dónde sale el precio y cuándo se consultó)" : "Source (where the price comes from and when it was checked)"}</Label>
          <Input id="rate-source" value={form.source} onChange={set("source")} required minLength={3} maxLength={300} />
        </div>
      </div>
      <p className="text-xs text-slate-500">{es ? "Las tarifas no se editan: un cambio de precio es una tarifa nueva con otra vigencia, y los registros viejos conservan la que se usó." : "Rates are not edited: a price change is a new rate with another effective date, and old records keep the one used."}</p>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {es ? "Agregar tarifa" : "Add rate"}
      </Button>
    </form>
  );
}
