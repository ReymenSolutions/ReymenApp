"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { discardWorkshopRequest, markWorkshopRequestViewed } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

type RequestRow = { id: string; vehicleId: string | null; viewedAt: Date | null; createdAt: Date; placas: string | null; marca: string; modelo: string; anio: number; kilometraje: number | null; servicioFalla: string; lead: { id: string; name: string; phone: string | null } };

function relativeTime(date: Date, now: Date, es: boolean) {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 60_000));
  if (minutes < 1) return es ? "ahora" : "now";
  const [n, unit] = minutes < 60 ? [minutes, "min"] : minutes < 1440 ? [Math.floor(minutes / 60), "h"] : [Math.floor(minutes / 1440), "d"];
  return es ? `hace ${n} ${unit}` : `${n} ${unit} ago`;
}

export function WorkshopRequests({ lang, requests, canManage, canReview, now }: { lang: string; requests: RequestRow[]; canManage: boolean; canReview: boolean; now: Date }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const es = lang === "es";
  async function markViewed(requestId: string) {
    setBusyId(requestId);
    try { await markWorkshopRequestViewed(requestId); router.refresh(); }
    catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo marcar como vista" : "Could not mark as viewed")); }
    finally { setBusyId(null); }
  }
  async function discard(requestId: string) {
    if (!window.confirm(es ? "¿Descartar esta solicitud? Seguirá en el historial del contacto." : "Discard this request? It will remain in the contact history.")) return;
    setBusyId(requestId);
    try { await discardWorkshopRequest(requestId); toast.success(es ? "Solicitud descartada" : "Request discarded"); router.refresh(); }
    catch (error) { toast.error(getErrorMessage(error, es ? "No se pudo descartar" : "Could not discard request")); }
    finally { setBusyId(null); }
  }
  return <section className="rounded-xl border border-slate-300 bg-white p-4">
    {!requests.length && <p className="rounded-lg bg-slate-50 p-5 text-sm text-slate-700">{es ? "No hay solicitudes por atender." : "No requests to review."}</p>}
    <ul className="space-y-4">{requests.map((request) => {
      const phone = request.lead.phone?.replace(/\D/g, "") ?? "";
      const minutes = Math.max(0, Math.floor((now.getTime() - new Date(request.createdAt).getTime()) / 60_000));
      const urgency = minutes > 240 ? "text-red-700" : minutes >= 60 ? "text-amber-700" : "text-slate-700";
      return <li key={request.id} className="rounded-xl border border-slate-400 bg-white p-4 shadow-sm">
        <details>
          <summary onClick={() => { if (!request.viewedAt && canReview && busyId === null) void markViewed(request.id); }} className="cursor-pointer list-none rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-lg font-bold text-slate-950">{request.lead.name}</p><p className="text-sm text-slate-700">{request.lead.phone || "—"}</p></div><div className="flex gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">Web</span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${request.viewedAt ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}`}>{request.viewedAt ? (es ? "Vista" : "Viewed") : (es ? "Nueva" : "New")}</span></div></div>
            <div className="mt-3 grid gap-2 text-sm text-slate-800 sm:grid-cols-2"><p><strong>{es ? "Vehículo:" : "Vehicle:"}</strong> {request.marca} {request.modelo} {request.anio}{request.placas ? ` · ${request.placas}` : ""}</p><p className={urgency}><strong>{es ? "Recibida:" : "Received:"}</strong> <time dateTime={new Date(request.createdAt).toISOString()} title={new Date(request.createdAt).toLocaleString(es ? "es-MX" : "en-US")}>{relativeTime(request.createdAt, now, es)}</time></p></div>
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-relaxed text-slate-800"><strong>{es ? "Servicio solicitado:" : "Requested service:"}</strong> {request.servicioFalla}</p>
          </summary>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><p>{es ? "Placas:" : "Plates:"} {request.placas || "—"} · {es ? "Kilometraje:" : "Mileage:"} {request.kilometraje == null ? "—" : `${request.kilometraje} km`}</p><Link href={`/portal/leads/${request.lead.id}`} className="font-semibold text-blue-800 underline">{es ? "Ver contacto en CRM" : "View CRM contact"}</Link></div>
        </details>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          {canManage && <Link href={`/portal/workshop/quotes/new?requestId=${encodeURIComponent(request.id)}`} className="rounded-md bg-[#245A9F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1C4A84]">{es ? "Cotizar" : "Quote"}</Link>}
          {phone && <a href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50">WhatsApp</a>}
          {canManage && <button type="button" disabled={busyId !== null} onClick={() => discard(request.id)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">{es ? "Descartar" : "Discard"}</button>}
        </div>
      </li>;
    })}</ul>
  </section>;
}
