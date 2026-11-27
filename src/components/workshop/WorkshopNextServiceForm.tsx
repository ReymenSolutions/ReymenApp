"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setWorkshopNextService } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

export function WorkshopNextServiceForm({ vehicleId, km, date, lang }: { vehicleId: string; km: number | null; date: string | null; lang: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const es = lang === "es";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const rawKm = String(data.get("km") ?? "");
    setBusy(true);
    try {
      await setWorkshopNextService(vehicleId, rawKm ? Number(rawKm) : null, String(data.get("date") ?? "") || null);
      toast.success(es ? "Próximo servicio guardado" : "Next service saved"); router.refresh();
    } catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo guardar" : "Could not save")); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="font-semibold">{es ? "Próximo servicio" : "Next service"}</h2>
    <p className="mt-1 text-xs text-slate-600">{es ? "Dato interno para seguimiento. No envía recordatorios automáticos todavía." : "Internal follow-up detail. Automatic reminders are not sent yet."}</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">{es ? "Kilometraje" : "Mileage"}<input className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" name="km" type="number" min={0} max={10000000} defaultValue={km ?? ""} /></label><label className="text-sm">{es ? "Fecha" : "Date"}<input className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2" name="date" type="date" defaultValue={date ?? ""} /></label></div>
    <button disabled={busy} className="mt-3 rounded-md bg-[#245A9F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{es ? "Guardar" : "Save"}</button>
  </form>;
}
