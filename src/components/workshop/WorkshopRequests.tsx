"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createWorkshopVehicleFromRequest } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

type RequestRow = { id: string; placas: string; marca: string; modelo: string; anio: number; kilometraje: number; servicioFalla: string; lead: { name: string; phone: string | null } };

export function WorkshopRequests({ lang, requests }: { lang: string; requests: RequestRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const es = lang === "es";
  if (!requests.length) return null;

  async function convert(event: React.FormEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const vin = String(data.get("vin") ?? "");
    setBusyId(requestId);
    try {
      await createWorkshopVehicleFromRequest(requestId, vin, data.get("confirmedIdentity") === "on");
      toast.success(es ? "Cliente y vehículo preparados" : "Customer and vehicle ready");
      router.push(`/portal/workshop?tab=quotes&requestId=${encodeURIComponent(requestId)}`);
      router.refresh();
    } catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo preparar la solicitud" : "Could not prepare request")); }
    finally { setBusyId(null); }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="font-semibold text-slate-900">{es ? "Solicitudes de la landing" : "Landing requests"}</h2>
    <p className="mt-1 text-xs text-slate-600">{es ? "Verifica la identidad y confirma el VIN. El teléfono enviado desde la landing no está verificado." : "Verify identity and confirm the VIN. The phone number submitted on the landing page is unverified."}</p>
    <ul className="mt-3 divide-y divide-slate-100">{requests.map((request) => <li key={request.id} className="py-3 text-sm">
      <p className="font-semibold text-slate-900">{request.lead.name} · {request.placas} · {request.marca} {request.modelo} {request.anio}</p>
      <p className="text-slate-600">{request.lead.phone ?? "—"} · {request.kilometraje} km · {request.servicioFalla}</p>
      <form onSubmit={(event) => convert(event, request.id)} className="mt-2 flex flex-wrap gap-2"><input name="vin" aria-label="VIN" required minLength={11} maxLength={17} placeholder="VIN" className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" /><label className="flex w-full items-center gap-2 text-xs"><input name="confirmedIdentity" type="checkbox" required />{es ? "Verifiqué la identidad y que este vehículo pertenece al cliente" : "I verified the identity and that this vehicle belongs to the customer"}</label><button disabled={busyId !== null} className="rounded-md bg-[#063C82] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{es ? "Crear cliente y vehículo" : "Create customer and vehicle"}</button></form>
    </li>)}</ul>
  </section>;
}
