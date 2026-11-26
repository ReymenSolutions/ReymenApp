import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getWorkshopContext } from "@/lib/workshop/context";
import { WorkshopNextServiceForm } from "@/components/workshop/WorkshopNextServiceForm";
import { vehicleRecommendations } from "@/lib/workshop/recommendations";

type HistoryRow = { id: string; kind: "quote" | "order"; folio: string | null; estado: string; title: string; createdAt: Date };

export default async function WorkshopVehicleHistory({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const ctx = await getWorkshopContext();
  const { id } = await params;
  const requestedPage = Number((await searchParams).page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 1000) : 1;
  const pageSize = 20;
  const vehicle = await prisma.workshopVehicle.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { id: true, placas: true, vin: true, marca: true, modelo: true, anio: true, kilometrajeActual: true, proximoServicioKm: true, proximoServicioFecha: true, customer: { select: { name: true } } },
  });
  if (!vehicle) notFound();
  const lastDelivery = await prisma.workshopWorkOrder.findFirst({
    where: { organizationId: ctx.organizationId, vehicleId: id, estado: "ENTREGADA", entregadaEn: { not: null } },
    select: { entregadaEn: true }, orderBy: { entregadaEn: "desc" },
  });
  const recommendations = vehicleRecommendations({ lastDeliveredAt: lastDelivery?.entregadaEn ?? null, nextServiceDate: vehicle.proximoServicioFecha, nextServiceKm: vehicle.proximoServicioKm, currentKm: vehicle.kilometrajeActual, now: new Date() });
  const history = await prisma.$queryRaw<HistoryRow[]>`
    SELECT id, 'quote' AS kind, folio, estado::text AS estado, "servicioTitulo" AS title, "createdAt"
    FROM "WorkshopQuote" WHERE "organizationId" = ${ctx.organizationId} AND "vehicleId" = ${id}
    UNION ALL
    SELECT o.id, 'order' AS kind, o.folio, o.estado::text AS estado, q."servicioTitulo" AS title, o."createdAt"
    FROM "WorkshopWorkOrder" o JOIN "WorkshopQuote" q ON q.id = o."quoteId" AND q."organizationId" = o."organizationId"
    WHERE o."organizationId" = ${ctx.organizationId} AND o."vehicleId" = ${id}
    ORDER BY "createdAt" DESC, id DESC
    LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}
  `;
  const hasNext = history.length > pageSize;
  const rows = history.slice(0, pageSize);
  const es = ctx.lang === "es";
  return <main className="space-y-5">
    <Link href="/portal/workshop?tab=vehicles" className="text-sm font-medium text-blue-700 underline">{es ? "Volver a vehículos" : "Back to vehicles"}</Link>
    <header className="rounded-xl bg-gradient-to-br from-[#031738] via-[#04275A] to-[#063C82] p-6 text-white">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#22C55E]">{es ? "Historial del vehículo" : "Vehicle history"}</p>
      <h1 className="mt-2 text-2xl font-bold">{vehicle.placas ?? vehicle.vin ?? (es ? "Vehículo" : "Vehicle")}</h1>
      <p className="mt-2 text-sm text-white/80">{[vehicle.marca, vehicle.modelo, vehicle.anio].filter(Boolean).join(" ")} · VIN {vehicle.vin ?? "—"}</p>
    </header>
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
      <p>{es ? "Cliente" : "Customer"}: {vehicle.customer.name ?? "—"}</p>
      <p>{es ? "Kilometraje actual" : "Current mileage"}: {vehicle.kilometrajeActual ?? "—"} km</p>
      {(vehicle.proximoServicioKm !== null || vehicle.proximoServicioFecha) && <p>{es ? "Próximo servicio" : "Next service"}: {vehicle.proximoServicioKm !== null ? `${vehicle.proximoServicioKm} km` : ""}{vehicle.proximoServicioFecha ? ` · ${vehicle.proximoServicioFecha.toLocaleDateString(es ? "es-MX" : "en-US")}` : ""}</p>}
    </section>
    {ctx.canManageFinancials && <WorkshopNextServiceForm vehicleId={vehicle.id} km={vehicle.proximoServicioKm} date={vehicle.proximoServicioFecha?.toISOString().slice(0, 10) ?? null} lang={ctx.lang} />}
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">{es ? "Qué conviene revisar" : "Suggested checks"}</h2>
      <p className="mt-1 text-xs text-slate-500">{es ? "Sugerencias basadas en el historial registrado; confirma el estado del vehículo con el cliente." : "Suggestions based on recorded history; confirm the vehicle condition with the customer."}</p>
      {recommendations.length ? <ul className="mt-3 space-y-2">{recommendations.map((item) => <li key={item.kind} className="rounded-lg border border-slate-200 p-3 text-sm">
        <span className="font-semibold">{item.kind === "general_review" ? (es ? "Revisión general a los 6 meses" : "Six-month general review") : item.kind === "next_service_date" ? (es ? "Próximo servicio por fecha" : "Next service by date") : (es ? "Próximo servicio por kilometraje" : "Next service by mileage")}</span>
        <span className="ml-2 text-slate-600">{item.date ? item.date.toLocaleDateString(es ? "es-MX" : "en-US", { timeZone: "UTC" }) : `${item.km} km`} · {item.due ? (es ? "Revisar ahora" : "Check now") : (es ? "Programado" : "Scheduled")}</span>
      </li>)}</ul> : <p className="mt-3 text-sm text-slate-600">{es ? "Todavía no hay servicios entregados ni próximos servicios registrados." : "No delivered services or upcoming services have been recorded yet."}</p>}
    </section>
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="font-semibold text-slate-900">{es ? "Cotizaciones y órdenes" : "Quotes and orders"}</h2>
      {rows.length ? <ol className="mt-3 divide-y divide-slate-100">{rows.map((row) => <li key={`${row.kind}-${row.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><div><p className="font-semibold text-slate-900">{row.kind === "quote" ? (es ? "Cotización" : "Quote") : (es ? "Orden" : "Order")} · {row.folio ?? (es ? "Sin folio" : "No number")}</p><p className="text-slate-600">{row.title} · {row.estado} · {row.createdAt.toLocaleDateString(es ? "es-MX" : "en-US")}</p></div>{row.kind === "quote" && row.folio && ctx.canManageFinancials && <a href={`/api/workshop/quotes/${row.id}/pdf`} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold">PDF</a>}</li>)}</ol> : <p className="mt-3 text-sm text-slate-600">{es ? "Aún no hay cotizaciones ni órdenes para este vehículo." : "No quotes or orders for this vehicle yet."}</p>}
    </section>
    <nav aria-label={es ? "Páginas del historial" : "History pages"} className="flex justify-between text-sm">
      {page > 1 ? <Link href={`/portal/workshop/vehicles/${id}?page=${page - 1}`} className="text-blue-700 underline">{es ? "Anterior" : "Previous"}</Link> : <span />}
      {hasNext && <Link href={`/portal/workshop/vehicles/${id}?page=${page + 1}`} className="text-blue-700 underline">{es ? "Siguiente" : "Next"}</Link>}
    </nav>
  </main>;
}
