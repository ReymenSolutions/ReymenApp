"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createWorkshopVehicleFromRequest } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

export function PrepareWorkshopRequest({ requestId, lang, name, phone, vehicle }: { requestId: string; lang: string; name: string; phone: string | null; vehicle: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const es = lang === "es";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      await createWorkshopVehicleFromRequest(requestId, String(data.get("vin") ?? ""), data.get("confirmedIdentity") === "on", String(data.get("placas") ?? ""), String(data.get("kilometraje") ?? ""));
      toast.success(es ? "Cliente y vehículo preparados" : "Customer and vehicle ready");
      router.refresh();
    } catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo preparar la solicitud" : "Could not prepare request")); }
    finally { setBusy(false); }
  }
  const field = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
  return <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-300 bg-white p-5">
    <div><h2 className="font-semibold text-slate-900">{es ? "Preparar cliente y vehículo" : "Prepare customer and vehicle"}</h2><p className="mt-1 text-sm text-slate-700">{name} · {phone || "—"} · {vehicle}</p></div>
    <p className="text-sm text-slate-600">{es ? "Confirma la identidad antes de vincular la solicitud. VIN, placas y kilometraje se pueden completar después; serán necesarios para emitir el PDF con folio." : "Confirm identity before linking the request. VIN, plates and mileage can be completed later; they are required to issue the numbered PDF."}</p>
    <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm text-slate-700">VIN {es ? "(opcional)" : "(optional)"}<input className={field} name="vin" maxLength={17} /></label><label className="text-sm text-slate-700">{es ? "Placas (opcional)" : "Plates (optional)"}<input className={field} name="placas" maxLength={12} /></label><label className="text-sm text-slate-700">{es ? "Kilometraje (opcional)" : "Mileage (optional)"}<input className={field} name="kilometraje" inputMode="numeric" pattern="[0-9,. ]*" /></label></div>
    <label className="flex items-start gap-2 text-sm text-slate-800"><input type="checkbox" name="confirmedIdentity" required className="mt-1" />{es ? "Verifiqué la identidad del cliente y que este vehículo le pertenece" : "I verified the customer's identity and that this vehicle belongs to them"}</label>
    <button disabled={busy} className="rounded-md bg-[#245A9F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1C4A84] disabled:opacity-50">{busy ? (es ? "Guardando…" : "Saving…") : (es ? "Continuar a cotización" : "Continue to quote")}</button>
  </form>;
}
