import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkshopContext } from "@/lib/workshop/context";
import { prisma } from "@/lib/prisma";
import { CreateQuoteForm } from "@/components/workshop/CreateQuoteForm";
import { PrepareWorkshopRequest } from "@/components/workshop/PrepareWorkshopRequest";

export default async function NewWorkshopQuotePage({ searchParams }: { searchParams: Promise<{ requestId?: string }> }) {
  const ctx = await getWorkshopContext();
  if (!ctx.canManageFinancials) redirect("/portal/workshop?tab=quotes");
  const es = ctx.lang === "es";
  const { requestId } = await searchParams;
  const request = requestId ? await prisma.workshopLeadRequest.findFirst({ where: { id: requestId, organizationId: ctx.organizationId }, select: { id: true, vehicleId: true, discardedAt: true, quote: { select: { id: true } }, marca: true, modelo: true, anio: true, servicioFalla: true, lead: { select: { name: true, phone: true } } } }) : null;
  if (requestId && (!request || request.discardedAt || request.quote)) redirect("/portal/workshop?tab=quotes&view=pending");
  const [vehicles, parts, services] = await Promise.all([
    prisma.workshopVehicle.findMany({ where: { organizationId: ctx.organizationId, ...(request?.vehicleId ? { id: request.vehicleId } : {}) }, select: { id: true, placas: true, vin: true, customer: { select: { name: true, phone: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.workshopPart.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, sku: true, nombre: true, unidad: true, precioVentaNeto: true, costoNeto: true }, orderBy: { nombre: "asc" }, take: 200 }),
    prisma.workshopService.findMany({ where: { organizationId: ctx.organizationId, active: true }, select: { id: true, nameEs: true, nameEn: true, precioVentaNeto: true, costoNeto: true }, orderBy: { nameEs: "asc" } }),
  ]);
  return <div className="mx-auto max-w-5xl space-y-5">
    <Link href="/portal/workshop?tab=quotes&view=pending" className="text-sm font-semibold text-[#981C25] underline">← {es ? "Volver a cotizaciones" : "Back to quotes"}</Link>
    <header className="rounded-xl border border-[#04275A] bg-gradient-to-br from-[#031738] via-[#04275A] to-[#063C82] p-5 text-white"><p className="text-xs font-semibold uppercase tracking-widest text-slate-200">{es ? "Workshop · Cotizaciones" : "Workshop · Quotes"}</p><h1 className="mt-2 text-2xl font-bold">{es ? "Nueva cotización" : "New quote"}</h1></header>
    {request && <div className="rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-800"><p className="font-semibold">{es ? "Solicitud del sitio" : "Website request"}: {request.lead.name} · {request.lead.phone || "—"}</p><p className="mt-1">{request.marca} {request.modelo} {request.anio} · {request.servicioFalla}</p></div>}
    {request && !request.vehicleId ? <PrepareWorkshopRequest requestId={request.id} lang={ctx.lang} name={request.lead.name} phone={request.lead.phone} vehicle={`${request.marca} ${request.modelo} ${request.anio}`} /> : <CreateQuoteForm lang={ctx.lang} vehicles={vehicles} parts={parts.map((part) => ({ ...part, precioVentaNeto: part.precioVentaNeto.toString(), costoNeto: part.costoNeto.toString() }))} services={services.map((service) => ({ ...service, precioVentaNeto: service.precioVentaNeto?.toFixed(2) ?? "", costoNeto: service.costoNeto?.toFixed(2) ?? "" }))} initialVehicleId={request?.vehicleId ?? undefined} initialService={request?.servicioFalla} requestId={request?.id} />}
  </div>;
}
