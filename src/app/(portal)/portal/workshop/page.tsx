import Link from "next/link";
import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { Prisma } from "@prisma/client";
import { getWorkshopContext } from "@/lib/workshop/context";
import { prisma } from "@/lib/prisma";
import { startOfLocalDay } from "@/lib/business-day";
import { CreateVehicleForm } from "@/components/workshop/CreateVehicleForm";
import { CreateQuoteForm } from "@/components/workshop/CreateQuoteForm";
import { QuoteActions } from "@/components/workshop/QuoteActions";
import { CreatePartForm } from "@/components/workshop/CreatePartForm";
import { CreatePurchaseForm } from "@/components/workshop/CreatePurchaseForm";
import { OrderOperations } from "@/components/workshop/OrderOperations";
import { AddAuthorizedLine } from "@/components/workshop/AddAuthorizedLine";
import { WorkshopRequests } from "@/components/workshop/WorkshopRequests";
import { WorkshopSettingsForm } from "@/components/workshop/WorkshopSettingsForm";
import { WorkshopServices } from "@/components/workshop/WorkshopServices";

type Tab = "panel" | "quotes" | "orders" | "vehicles" | "contacts" | "inventory" | "purchases" | "cash" | "settings";

const TABS: { id: Tab; es: string; en: string; financial?: boolean }[] = [
  { id: "panel", es: "Panel", en: "Overview", financial: true },
  { id: "quotes", es: "Cotizaciones", en: "Quotes" },
  { id: "orders", es: "Órdenes", en: "Orders" },
  { id: "vehicles", es: "Vehículos", en: "Vehicles" },
  { id: "contacts", es: "Contactos", en: "Contacts" },
  { id: "inventory", es: "Inventario", en: "Inventory", financial: true },
  { id: "purchases", es: "Compras", en: "Purchases", financial: true },
  { id: "cash", es: "Caja", en: "Cash", financial: true },
  { id: "settings", es: "Configuración", en: "Settings", financial: true },
];

function checklistField(value: Prisma.JsonValue | null, key: string): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const field = value[key];
  return typeof field === "string" ? field : "";
}

export default async function WorkshopPage({ searchParams }: { searchParams: Promise<{ tab?: string; requestId?: string; q?: string }> }) {
  const ctx = await getWorkshopContext();
  const es = ctx.lang === "es";
  const query = await searchParams;
  const selected = query.tab ?? "panel";
  const tab = TABS.find((item) => item.id === selected) ?? TABS[0];
  if (tab.financial && !ctx.canManageFinancials) redirect("/portal/workshop?tab=orders");
  const tabs = TABS.filter((item) => ctx.canManageFinancials || !item.financial);
  const contactSearch = (query.q ?? "").trim().slice(0, 60);
  const contactFilter = contactSearch ? { OR: [{ name: { contains: contactSearch, mode: "insensitive" as const } }, { phone: { contains: contactSearch } }] } : {};
  const [contactCustomers, contactLeads] = tab.id === "contacts" ? await Promise.all([
    prisma.customer.findMany({ where: { organizationId: ctx.organizationId, ...contactFilter }, select: { id: true, name: true, phone: true, workshopVehicles: { select: { id: true, marca: true, modelo: true, anio: true, placas: true }, take: 5, orderBy: { createdAt: "desc" } } }, take: 50, orderBy: { createdAt: "desc" } }),
    prisma.lead.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null, ...contactFilter }, select: { id: true, name: true, phone: true, source: true }, take: 50, orderBy: { createdAt: "desc" } }),
  ]) : [[], []];

  const counts = tab.id === "panel" ? await Promise.all([
    prisma.workshopWorkOrder.count({ where: { organizationId: ctx.organizationId, estado: { notIn: ["ENTREGADA", "CANCELADA"] } } }),
    prisma.workshopWorkOrder.count({ where: { organizationId: ctx.organizationId, estado: "LISTA_PARA_ENTREGA" } }),
    prisma.workshopQuote.count({ where: { organizationId: ctx.organizationId, estado: { in: ["BORRADOR", "ENVIADA"] } } }),
    prisma.workshopVehicle.count({ where: { organizationId: ctx.organizationId } }),
    prisma.workshopPurchase.count({ where: { organizationId: ctx.organizationId } }),
  ]) : null;

  const rows = tab.id === "orders" ? await prisma.workshopWorkOrder.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, folio: true, estado: true, createdAt: true, kilometrajeIngreso: true, nivelCombustible: true, fallaReportada: true, diagnostico: true, checklistRecepcion: true, customer: { select: { name: true } }, vehicle: { select: { id: true, placas: true, marca: true, modelo: true } } }, take: 50, orderBy: { createdAt: "desc" } })
    : tab.id === "vehicles" ? await prisma.workshopVehicle.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, placas: true, vin: true, marca: true, modelo: true, createdAt: true }, take: 50, orderBy: { createdAt: "desc" } })
    : [];
  const orderBalances = tab.id === "orders" && ctx.canManageFinancials
    ? await prisma.workshopWorkOrder.findMany({ where: { organizationId: ctx.organizationId, id: { in: rows.map((row) => row.id) } }, select: { id: true, saldo: true, facturaSolicitada: true } })
    : [];
  const balanceByOrder = new Map(orderBalances.map((order) => [order.id, order.saldo.toFixed(2)]));
  const invoiceByOrder = new Map(orderBalances.map((order) => [order.id, order.facturaSolicitada]));
  const orderParts = tab.id === "orders" && ctx.canManageFinancials
    ? await prisma.workshopPart.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, sku: true, nombre: true, unidad: true, costoNeto: true, precioVentaNeto: true }, orderBy: { nombre: "asc" }, take: 200 })
    : [];
  const authorizedLineParts = orderParts.map((part) => ({ ...part, costoNeto: part.costoNeto.toFixed(2), precioVentaNeto: part.precioVentaNeto.toFixed(2) }));
  const customers = tab.id === "vehicles" && ctx.canManageFinancials
    ? await prisma.customer.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, name: true, phone: true }, orderBy: { createdAt: "desc" }, take: 200 })
    : [];
  const workshopRequests = tab.id === "quotes"
    ? await prisma.workshopLeadRequest.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, vehicleId: true, viewedAt: true, createdAt: true, placas: true, marca: true, modelo: true, anio: true, kilometraje: true, servicioFalla: true, lead: { select: { id: true, name: true, phone: true } } }, orderBy: { createdAt: "desc" }, take: 50 })
    : [];
  const quoteRequest = tab.id === "quotes" && ctx.canManageFinancials && query.requestId
    ? await prisma.workshopLeadRequest.findFirst({ where: { id: query.requestId, organizationId: ctx.organizationId, vehicleId: { not: null } }, select: { vehicleId: true, servicioFalla: true } })
    : null;
  const settings = tab.id === "settings" && ctx.canManageFinancials
    ? await prisma.workshopSettings.findUnique({ where: { organizationId: ctx.organizationId }, select: { vigenciaDias: true, garantiaDias: true, garantiaKm: true } })
    : null;
  const services = tab.id === "settings" && ctx.canManageFinancials
    ? await prisma.workshopService.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, nameEs: true, nameEn: true, costoNeto: true, precioVentaNeto: true, active: true, provisional: true }, orderBy: { nameEs: "asc" } })
    : [];
  const quoteVehicles = tab.id === "quotes" && ctx.canManageFinancials
    ? await prisma.workshopVehicle.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, placas: true, vin: true, customer: { select: { name: true, phone: true } } }, take: 200, orderBy: { createdAt: "desc" } })
    : [];
  const quoteParts = tab.id === "quotes" && ctx.canManageFinancials
    ? await prisma.workshopPart.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, sku: true, nombre: true, unidad: true, precioVentaNeto: true, costoNeto: true }, orderBy: { nombre: "asc" }, take: 200 })
    : [];
  const quoteServices = tab.id === "quotes" && ctx.canManageFinancials
    ? await prisma.workshopService.findMany({ where: { organizationId: ctx.organizationId, active: true }, select: { id: true, nameEs: true, nameEn: true, precioVentaNeto: true, costoNeto: true }, orderBy: { nameEs: "asc" } })
    : [];
  const quotes = tab.id === "quotes" && ctx.canManageFinancials
    ? await prisma.workshopQuote.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, folio: true, estado: true, servicioTitulo: true, subtotalNeto: true, iva: true, total: true }, take: 50, orderBy: { createdAt: "desc" } })
    : [];
  const printableQuotes = tab.id === "quotes" && ctx.canPrintQuotes && !ctx.canManageFinancials
    ? await prisma.workshopQuote.findMany({ where: { organizationId: ctx.organizationId, folio: { not: null } }, select: { id: true, folio: true, estado: true, servicioTitulo: true, customer: { select: { name: true } }, vehicle: { select: { marca: true, modelo: true, placas: true } } }, take: 50, orderBy: { createdAt: "desc" } })
    : [];
  const inventoryParts = tab.id === "inventory" && ctx.canManageFinancials
    ? await prisma.workshopPart.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, sku: true, nombre: true, unidad: true, costoNeto: true, precioVentaNeto: true, stockMinimo: true }, orderBy: { nombre: "asc" }, take: 200 })
    : [];
  const movements = inventoryParts.length ? await prisma.workshopInventoryMovement.findMany({ where: { organizationId: ctx.organizationId, partId: { in: inventoryParts.map((part) => part.id) } }, select: { partId: true, tipo: true, cantidad: true } }) : [];
  const stock = new Map<string, Prisma.Decimal>();
  for (const movement of movements) stock.set(movement.partId, (stock.get(movement.partId) ?? new Prisma.Decimal(0)).plus(movement.tipo === "SALIDA_ORDEN" ? movement.cantidad.neg() : movement.cantidad));
  const purchaseParts = tab.id === "purchases" && ctx.canManageFinancials
    ? await prisma.workshopPart.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, sku: true, nombre: true, costoNeto: true }, orderBy: { nombre: "asc" }, take: 200 })
    : [];
  const purchases = tab.id === "purchases" && ctx.canManageFinancials
    ? await prisma.workshopPurchase.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, proveedor: true, fecha: true, total: true }, orderBy: { fecha: "desc" }, take: 50 })
    : [];
  const cashRows = tab.id === "cash" && ctx.canManageFinancials
    ? await prisma.workshopCashMovement.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, fecha: true, tipo: true, concepto: true, monto: true, metodo: true }, orderBy: { fecha: "desc" }, take: 50 })
    : [];
  const now = new Date();
  const todayStart = startOfLocalDay(now, ctx.timezone);
  const tomorrowStart = startOfLocalDay(new Date(now.getTime() + 86_400_000), ctx.timezone);
  const cashTotals = tab.id === "panel" && ctx.canManageFinancials ? await Promise.all([
    prisma.workshopCashMovement.aggregate({ where: { organizationId: ctx.organizationId, tipo: "INGRESO" }, _sum: { monto: true } }),
    prisma.workshopCashMovement.aggregate({ where: { organizationId: ctx.organizationId, tipo: "EGRESO" }, _sum: { monto: true } }),
    prisma.workshopCashMovement.aggregate({ where: { organizationId: ctx.organizationId, tipo: "INGRESO", fecha: { gte: todayStart, lt: tomorrowStart } }, _sum: { monto: true } }),
  ]) : null;
  const balance = cashTotals ? (cashTotals[0]._sum.monto ?? new Prisma.Decimal(0)).minus(cashTotals[1]._sum.monto ?? new Prisma.Decimal(0)) : null;

  return (
    <div className="space-y-5">
      <header className="rounded-xl bg-gradient-to-br from-[#031738] via-[#04275A] to-[#063C82] px-5 py-6 text-white sm:px-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[#22C55E]"><Wrench className="h-4 w-4" />{ctx.orgName}</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-4xl">{es ? "Reymen Talleres" : "Reymen Workshop"}</h1>
        <p className="mt-1 text-sm text-white/80">{es ? "Vehículos, trabajos y caja en un solo lugar" : "Vehicles, jobs and cash in one place"}</p>
      </header>
      <nav aria-label={es ? "Secciones del taller" : "Workshop sections"} className="flex max-w-full gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((item) => <Link key={item.id} href={`/portal/workshop?tab=${item.id}`} aria-current={tab.id === item.id ? "page" : undefined} className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${tab.id === item.id ? "border-[#22C55E] text-[#031738]" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{es ? item.es : item.en}</Link>)}
      </nav>
      {counts && <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[
        [es ? "Órdenes activas" : "Active orders", counts[0]],
        [es ? "Listas para entregar" : "Ready for delivery", counts[1]],
        [es ? "Cotizaciones pendientes" : "Pending quotes", counts[2]],
        [es ? "Vehículos" : "Vehicles", counts[3]],
        [es ? "Compras" : "Purchases", counts[4]],
      ].map(([label, value], index) => <div key={String(label)} className={`rounded-xl border border-slate-200 bg-white p-4 ${index === 4 ? "col-span-2 lg:col-span-1" : ""}`}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></div>)}</div>}
      {balance !== null && <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{es ? "Balance de caja" : "Cash balance"}</p><p className="text-xl font-bold">${balance.toFixed(2)} MXN</p></div><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{es ? "Ingresos de hoy" : "Today's income"}</p><p className="text-xl font-bold">${(cashTotals?.[2]._sum.monto ?? new Prisma.Decimal(0)).toFixed(2)} MXN</p></div></div>}
      {tab.id === "vehicles" && ctx.canManageFinancials && <CreateVehicleForm lang={ctx.lang} customers={customers} />}
      {tab.id === "quotes" && <WorkshopRequests lang={ctx.lang} requests={workshopRequests} canManage={ctx.canManageFinancials} />}
      {tab.id === "contacts" && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold text-slate-900">{es ? "Contactos del taller" : "Workshop contacts"}</h2><p className="mt-1 text-xs text-slate-600">{es ? "Clientes y prospectos del CRM de este negocio. La ficha del vehículo y las solicitudes se mantienen dentro de Workshop." : "Customers and leads from this business's CRM. Vehicle records and requests stay inside Workshop."}</p><form method="get" className="mt-3 flex gap-2"><input type="hidden" name="tab" value="contacts" /><input name="q" defaultValue={contactSearch} aria-label={es ? "Buscar contacto" : "Search contact"} placeholder={es ? "Nombre o teléfono" : "Name or phone"} className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" /><button className="rounded-md bg-[#063C82] px-4 py-2 text-sm font-semibold text-white">{es ? "Buscar" : "Search"}</button></form><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><h3 className="font-semibold">{es ? "Clientes registrados" : "Registered customers"}</h3><ul className="mt-2 divide-y divide-slate-100">{contactCustomers.map((person) => <li key={person.id} className="py-3 text-sm"><p className="font-medium text-slate-900">{person.name || (es ? "Sin nombre" : "No name")}</p><a href={`tel:${person.phone}`} className="text-blue-800 underline">{person.phone}</a>{person.workshopVehicles.map((vehicle) => <p key={vehicle.id} className="mt-1"><Link href={`/portal/workshop/vehicles/${vehicle.id}`} className="text-blue-800 underline">{vehicle.marca} {vehicle.modelo} {vehicle.anio} · {vehicle.placas || "—"}</Link></p>)}</li>)}</ul>{!contactCustomers.length && <p className="mt-2 text-sm text-slate-500">{es ? "Sin clientes para esta búsqueda" : "No customers found"}</p>}</div><div><h3 className="font-semibold">{es ? "Prospectos" : "Leads"}</h3><ul className="mt-2 divide-y divide-slate-100">{contactLeads.map((person) => <li key={person.id} className="py-3 text-sm"><p className="font-medium text-slate-900">{person.name}</p><p className="text-slate-600">{person.phone || "—"}{person.source === "landing" ? (es ? " · Solicitud web" : " · Website request") : ""}</p></li>)}</ul>{!contactLeads.length && <p className="mt-2 text-sm text-slate-500">{es ? "Sin prospectos para esta búsqueda" : "No leads found"}</p>}</div></div></section>}
      {tab.id === "settings" && ctx.canManageFinancials && <WorkshopSettingsForm lang={ctx.lang} defaults={settings ?? { vigenciaDias: 15, garantiaDias: 90, garantiaKm: 5000 }} />}
      {tab.id === "settings" && ctx.canManageFinancials && <WorkshopServices lang={ctx.lang} services={services.map((service) => ({ ...service, costoNeto: service.costoNeto?.toFixed(2) ?? "", precioVentaNeto: service.precioVentaNeto?.toFixed(2) ?? "" }))} />}
      {tab.id === "quotes" && ctx.canManageFinancials && <CreateQuoteForm key={query.requestId ?? "new"} lang={ctx.lang} vehicles={quoteVehicles} parts={quoteParts.map((part) => ({ ...part, precioVentaNeto: part.precioVentaNeto.toString(), costoNeto: part.costoNeto.toString() }))} services={quoteServices.map((service) => ({ ...service, precioVentaNeto: service.precioVentaNeto?.toFixed(2) ?? "", costoNeto: service.costoNeto?.toFixed(2) ?? "" }))} initialVehicleId={quoteRequest?.vehicleId ?? undefined} initialService={quoteRequest?.servicioFalla} />}
      {tab.id === "inventory" && ctx.canManageFinancials && <CreatePartForm lang={ctx.lang} />}
      {tab.id === "inventory" && ctx.canManageFinancials && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Existencias" : "Stock"}</h2><ul className="mt-3 divide-y divide-slate-100">{inventoryParts.map((part) => { const qty = stock.get(part.id) ?? new Prisma.Decimal(0); return <li key={part.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{part.sku} · {part.nombre}</span><span className={qty.lt(part.stockMinimo) ? "font-semibold text-red-700" : "font-semibold"}>{qty.toString()} {part.unidad}</span></li>; })}</ul></section>}
      {tab.id === "purchases" && ctx.canManageFinancials && <CreatePurchaseForm lang={ctx.lang} parts={purchaseParts.map((part) => ({ ...part, costoNeto: part.costoNeto.toString() }))} />}
      {purchases.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Compras" : "Purchases"}</h2><ul className="mt-3 divide-y divide-slate-100">{purchases.map((purchase) => <li key={purchase.id} className="flex justify-between gap-2 py-2 text-sm"><span>{purchase.proveedor} · {purchase.fecha.toLocaleDateString(es ? "es-MX" : "en-US")}</span><span>${purchase.total.toFixed(2)} MXN</span></li>)}</ul></section>}
      {cashRows.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Movimientos de caja" : "Cash movements"}</h2><ul className="mt-3 divide-y divide-slate-100">{cashRows.map((movement) => <li key={movement.id} className="flex justify-between gap-2 py-2 text-sm"><span>{movement.concepto} · {movement.metodo}</span><span className={movement.tipo === "EGRESO" ? "text-red-700" : "text-emerald-700"}>{movement.tipo === "EGRESO" ? "−" : "+"}${movement.monto.toFixed(2)} MXN</span></li>)}</ul></section>}
      {quotes.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Cotizaciones" : "Quotes"}</h2><ul className="mt-3 divide-y divide-slate-100">{quotes.map((quote) => <li key={quote.id} className="space-y-2 py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{quote.folio ?? (es ? "Sin folio" : "No number")} · {quote.servicioTitulo} · {quote.estado}</span><span className="font-semibold">${Number(quote.total).toFixed(2)} MXN</span></div><QuoteActions id={quote.id} folio={quote.folio} estado={quote.estado} lang={ctx.lang} /></li>)}</ul></section>}
      {tab.id === "quotes" && ctx.canPrintQuotes && !ctx.canManageFinancials && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Cotizaciones listas para imprimir" : "Quotes ready to print"}</h2><p className="mt-1 text-xs text-slate-600">{es ? "El administrador emite la cotización. El PDF del cliente no incluye costos ni utilidad." : "An administrator issues the quote. The customer PDF does not include costs or profit."}</p>{printableQuotes.length ? <ul className="mt-3 divide-y divide-slate-100">{printableQuotes.map((quote) => <li key={quote.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span>{quote.folio} · {quote.customer.name || (es ? "Cliente" : "Customer")} · {quote.vehicle.marca} {quote.vehicle.modelo} · {quote.vehicle.placas || "—"} · {quote.servicioTitulo}</span><a href={`/api/workshop/quotes/${quote.id}/pdf`} target="_blank" rel="noopener noreferrer" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-blue-800">{es ? "Abrir PDF para imprimir" : "Open PDF to print"}</a></li>)}</ul> : <p className="mt-3 text-sm text-slate-500">{es ? "Aún no hay cotizaciones emitidas." : "No quotes have been issued yet."}</p>}</section>}
      {rows.length > 0 ? <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? tab.es : tab.en}</h2><ul className="mt-3 divide-y divide-slate-100">{rows.map((row) => <li key={row.id} className="py-3 text-sm text-slate-700">{"folio" in row ? <><strong className="block text-base text-slate-900">{row.folio} · {row.vehicle.placas ?? `${row.vehicle.marca ?? ""} ${row.vehicle.modelo ?? ""}`} · {row.customer.name ?? (es ? "Cliente" : "Customer")}</strong><Link href={`/portal/workshop/vehicles/${row.vehicle.id}`} className="mt-1 inline-block text-xs font-semibold text-blue-800 underline">{es ? "Ver historial y revisiones recomendadas" : "View history and suggested checks"}</Link><OrderOperations id={row.id} estado={row.estado} kilometrajeIngreso={row.kilometrajeIngreso} nivelCombustible={row.nivelCombustible} fallaReportada={row.fallaReportada} diagnostico={row.diagnostico} checklist={{ danosPrevios: checklistField(row.checklistRecepcion, "danosPrevios"), testigos: checklistField(row.checklistRecepcion, "testigos"), pertenencias: checklistField(row.checklistRecepcion, "pertenencias") }} saldo={balanceByOrder.get(row.id)} facturaSolicitada={invoiceByOrder.get(row.id)} canManageFinancials={ctx.canManageFinancials} lang={ctx.lang} />{ctx.canManageFinancials && ["DIAGNOSTICO", "EN_REPARACION"].includes(row.estado) && <AddAuthorizedLine orderId={row.id} parts={authorizedLineParts} lang={ctx.lang} />}</> : <Link href={`/portal/workshop/vehicles/${row.id}`} className="font-medium text-blue-700 underline">{row.placas ?? "—"} · {row.marca ?? ""} {row.modelo ?? ""} · {row.vin ?? "—"}</Link>}</li>)}</ul></section>
      : tab.id !== "panel" && tab.id !== "quotes" && tab.id !== "vehicles" && <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{es ? "No hay registros en esta sección todavía. Los formularios y operaciones están en desarrollo; este módulo aún no está listo para usarse en producción." : "There are no records in this section yet. Forms and operations are in development; this module is not ready for production use."}</div>}
    </div>
  );
}
