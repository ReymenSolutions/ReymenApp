"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveWorkshopSettings } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

export function WorkshopSettingsForm({ lang, defaults }: { lang: string; defaults: { vigenciaDias: number; garantiaDias: number; garantiaKm: number } }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const es = lang === "es";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await saveWorkshopSettings({ vigenciaDias: Number(data.get("vigenciaDias")), garantiaDias: Number(data.get("garantiaDias")), garantiaKm: Number(data.get("garantiaKm")) });
      toast.success(es ? "Configuración guardada" : "Settings saved"); router.refresh();
    } catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo guardar" : "Could not save")); }
    finally { setBusy(false); }
  }
  const field = "mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm";
  return <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="font-semibold">{es ? "Vigencia y garantía por defecto" : "Default validity and warranty"}</h2>
    <p className="mt-1 text-xs text-slate-600">{es ? "Se aplican a cotizaciones nuevas; las anteriores conservan sus condiciones." : "Applies to new quotes; older quotes keep their terms."}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <label className="text-sm">{es ? "Vigencia (días)" : "Validity (days)"}<input className={field} name="vigenciaDias" type="number" min={1} max={365} required defaultValue={defaults.vigenciaDias} /></label>
      <label className="text-sm">{es ? "Garantía (días)" : "Warranty (days)"}<input className={field} name="garantiaDias" type="number" min={0} max={3650} required defaultValue={defaults.garantiaDias} /></label>
      <label className="text-sm">{es ? "Garantía (km)" : "Warranty (km)"}<input className={field} name="garantiaKm" type="number" min={0} max={100000} required defaultValue={defaults.garantiaKm} /></label>
    </div>
    <button disabled={busy} className="mt-4 rounded-md bg-[#B91C1C] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{es ? "Guardar configuración" : "Save settings"}</button>
  </form>;
}
