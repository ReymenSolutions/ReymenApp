"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { createWorkshopVehicleFromRequest, markWorkshopRequestViewed } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

type RequestRow = { id: string; vehicleId: string | null; viewedAt: Date | null; createdAt: Date; placas: string | null; marca: string; modelo: string; anio: number; kilometraje: number | null; servicioFalla: string; lead: { id: string; name: string; phone: string | null } };

export function WorkshopRequests({ lang, requests, canManage, canReview }: { lang: string; requests: RequestRow[]; canManage: boolean; canReview: boolean }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const es = lang === "es";
  async function markViewed(requestId: string) {
    setBusyId(requestId);
    try {
      await markWorkshopRequestViewed(requestId);
      router.refresh();
    } catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo marcar como vista" : "Could not mark as viewed")); }
    finally { setBusyId(null); }
  }

  async function convert(event: React.FormEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const vin = String(data.get("vin") ?? "");
    setBusyId(requestId);
    try {
      await createWorkshopVehicleFromRequest(requestId, vin, data.get("confirmedIdentity") === "on", String(data.get("placas") ?? "") || undefined, String(data.get("kilometraje") ?? "") || undefined);
      toast.success(es ? "Cliente y vehículo preparados" : "Customer and vehicle ready");
      router.push(`/portal/workshop?tab=quotes&requestId=${encodeURIComponent(requestId)}`);
      router.refresh();
    } catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo preparar la solicitud" : "Could not prepare request")); }
    finally { setBusyId(null); }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <h2 className="font-semibold text-slate-900">{es ? "Solicitudes recibidas desde la web" : "Requests received from the website"}</h2>
    <p className="mt-1 text-xs text-slate-600">{canManage ? (es ? "Estas solicitudes aún no son cotizaciones con precio. Revisa los datos, verifica la identidad y crea el vehículo antes de cotizar." : "These requests are not priced quotes yet. Review the details, verify identity, and create the vehicle before quoting.") : (es ? "Solicitudes de clientes para revisar. El administrador prepara la cotización y sus precios." : "Customer requests to review. An administrator prepares the priced quote.")}</p>
    {!requests.length && <p className="mt-3 text-sm text-slate-600">{es ? "Todavía no hay solicitudes de la web." : "There are no website requests yet."}</p>}
    <ul className="mt-3 divide-y divide-slate-100">{requests.map((request) => <li key={request.id} className="py-4 text-sm">
      <details onToggle={(event) => { if (event.currentTarget.open && !request.viewedAt && canReview && busyId === null) void markViewed(request.id); }}>
      <summary className="cursor-pointer list-none rounded-md px-2 py-2 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">{request.lead.name} · {request.marca} {request.modelo} {request.anio}</p><span className={`rounded-full px-2 py-1 text-xs font-semibold ${request.vehicleId ? "bg-slate-100 text-slate-700" : request.viewedAt ? "bg-slate-100 text-slate-700" : "bg-green-100 text-green-800"}`}>{request.vehicleId ? (es ? "Vehículo creado" : "Vehicle created") : request.viewedAt ? (es ? "Vista" : "Viewed") : (es ? "Nueva" : "New")}</span></div>
      <p className="mt-1 text-slate-600">{request.createdAt.toLocaleDateString(es ? "es-MX" : "en-US")} · {request.lead.phone ?? "—"} · {request.placas ?? (es ? "Placas pendientes" : "Plates pending")} · {request.kilometraje == null ? (es ? "Kilometraje pendiente" : "Mileage pending") : `${request.kilometraje} km`}</p>
      <span className="mt-1 inline-block text-xs font-medium text-red-800">{es ? "Ver detalles" : "View details"}</span>
      </summary>
      <p className="mt-2 rounded-md bg-slate-50 p-2 text-slate-800"><span className="font-medium">{es ? "Servicio o falla: " : "Service or issue: "}</span>{request.servicioFalla}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3"><Link href={`/portal/leads/${request.lead.id}`} className="text-xs font-semibold text-red-800 underline">{es ? "Ver contacto en CRM" : "View CRM contact"}</Link>{canManage && request.vehicleId && <Link href={`/portal/workshop?tab=quotes&view=new&requestId=${encodeURIComponent(request.id)}`} className="text-xs font-semibold text-red-800 underline">{es ? "Crear cotización" : "Create quote"}</Link>}</div>
      {canManage && !request.vehicleId && <><p className="mt-3 text-xs text-slate-600">{es ? "Para crear el vehículo, confirma VIN, placas, kilometraje e identidad. El teléfono de la web no está verificado." : "To create the vehicle, confirm VIN, plate, mileage, and identity. The website phone is unverified."}</p><form onSubmit={(event) => convert(event, request.id)} className="mt-2 flex flex-wrap gap-2"><input name="vin" aria-label="VIN" required minLength={11} maxLength={17} placeholder="VIN" className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />
        {!request.placas && <input name="placas" aria-label={es ? "Placas" : "License plate"} required minLength={4} maxLength={12} placeholder={es ? "Placas" : "License plate"} className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />}
        {request.kilometraje == null && <input name="kilometraje" aria-label={es ? "Kilometraje" : "Mileage"} required inputMode="numeric" pattern="[0-9,. ]+" placeholder={es ? "Kilometraje" : "Mileage"} className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" />}
        <label className="flex w-full items-center gap-2 text-xs"><input name="confirmedIdentity" type="checkbox" required />{es ? "Verifiqué la identidad y que este vehículo pertenece al cliente" : "I verified the identity and that this vehicle belongs to the customer"}</label><button disabled={busyId !== null} className="rounded-md bg-[#B91C1C] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{es ? "Crear cliente y vehículo" : "Create customer and vehicle"}</button></form></>}
      </details>
    </li>)}</ul>
  </section>;
}
