import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Wrench } from "lucide-react";
import { Prisma } from "@prisma/client";
import { getWorkshopContext } from "@/lib/workshop/context";
import { prisma } from "@/lib/prisma";
import { startOfLocalDay } from "@/lib/business-day";
import { CreateVehicleForm } from "@/components/workshop/CreateVehicleForm";
import { QuoteActions } from "@/components/workshop/QuoteActions";
import { CreatePartForm } from "@/components/workshop/CreatePartForm";
import { CreatePurchaseForm } from "@/components/workshop/CreatePurchaseForm";
import { OrderOperations } from "@/components/workshop/OrderOperations";
import { AddAuthorizedLine } from "@/components/workshop/AddAuthorizedLine";
import { WorkshopRequests } from "@/components/workshop/WorkshopRequests";
import { WorkshopQuoteSections } from "@/components/workshop/WorkshopQuoteSections";
import { WorkshopTabs } from "@/components/workshop/WorkshopTabs";
import { WorkshopFilters } from "@/components/workshop/WorkshopFilters";
import { workshopDateFilter } from "@/lib/workshop/date-filters";
import { WorkshopContactsTable } from "@/components/workshop/WorkshopContactsTable";
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

function validityLabel(sentAt: Date | null, days: number, now: Date, es: boolean) {
  if (!sentAt) return es ? "Pendiente de envío" : "Not sent yet";
  const remaining = Math.ceil((sentAt.getTime() + days * 86_400_000 - now.getTime()) / 86_400_000);
  if (remaining < 0) return es ? `Venció hace ${Math.abs(remaining)} días` : `Expired ${Math.abs(remaining)} days ago`;
  return es ? `Vence en ${remaining} días` : `Expires in ${remaining} days`;
}

export default async function WorkshopPage({ searchParams }: { searchParams: Promise<{ tab?: string; view?: string; page?: string; q?: string; client?: string; vehicle?: string; from?: string; to?: string; status?: string }> }) {
  const ctx = await getWorkshopContext();
  const es = ctx.lang === "es";
  const query = await searchParams;
  const selected = query.tab ?? "panel";
  const tab = TABS.find((item) => item.id === selected) ?? TABS[0];
  const quoteView = query.view === "mine" ? "mine" : "pending";
  const requestedPage = Number(query.page ?? 1);
  const requestPage = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 10_000) : 1;
  const requestPageSize = 10;
  const q = (query.q ?? "").trim().slice(0, 80);
  const client = (query.client ?? "").trim().slice(0, 80);
  const vehicle = (query.vehicle ?? "").trim().slice(0, 80);
  const dateRange = workshopDateFilter(query.from, query.to, ctx.timezone);
  const createdAt = Object.keys(dateRange).length ? { createdAt: dateRange } : {};
  const filterValues = { q, client, vehicle, from: query.from, to: query.to, status: query.status };
  if (tab.financial && !ctx.canManageFinancials) redirect("/portal/workshop?tab=orders");
  const tabs = TABS.filter((item) => ctx.canManageFinancials || !item.financial);
  const contactSearch = q;
  const contactFilter = contactSearch ? { OR: [{ name: { contains: contactSearch, mode: "insensitive" as const } }, { phone: { contains: contactSearch } }] } : {};
  const [contactCustomers, contactLeads] = tab.id === "contacts" ? await Promise.all([
    prisma.customer.findMany({ where: { organizationId: ctx.organizationId, ...createdAt, AND: [contactFilter, ...(client ? [{ OR: [{ name: { contains: client, mode: "insensitive" as const } }, { phone: { contains: client } }] }] : [])], ...(vehicle ? { workshopVehicles: { some: { OR: [{ marca: { contains: vehicle, mode: "insensitive" } }, { modelo: { contains: vehicle, mode: "insensitive" } }, { placas: { contains: vehicle, mode: "insensitive" } }] } } } : {}) }, select: { id: true, name: true, phone: true, postalCode: true, leadId: true, createdAt: true, lead: { select: { workshopRequests: { select: { id: true, marca: true, modelo: true, anio: true, placas: true, kilometraje: true, servicioFalla: true, createdAt: true }, take: 3, orderBy: { createdAt: "desc" } } } }, workshopVehicles: { select: { id: true, marca: true, modelo: true, anio: true, placas: true }, take: 5, orderBy: { createdAt: "desc" } } }, take: 50, orderBy: { createdAt: "desc" } }),
    prisma.lead.findMany({ where: { organizationId: ctx.organizationId, deletedAt: null, customers: { none: { organizationId: ctx.organizationId } }, ...createdAt, AND: [contactFilter, ...(client ? [{ OR: [{ name: { contains: client, mode: "insensitive" as const } }, { phone: { contains: client } }] }] : [])], ...(vehicle ? { workshopRequests: { some: { OR: [{ marca: { contains: vehicle, mode: "insensitive" } }, { modelo: { contains: vehicle, mode: "insensitive" } }, { placas: { contains: vehicle, mode: "insensitive" } }] } } } : {}) }, select: { id: true, name: true, phone: true, email: true, source: true, status: true, createdAt: true, workshopRequests: { select: { id: true, marca: true, modelo: true, anio: true, placas: true, kilometraje: true, servicioFalla: true, createdAt: true }, take: 3, orderBy: { createdAt: "desc" } } }, take: 50, orderBy: { createdAt: "desc" } }),
  ]) : [[], []];

  const counts = tab.id === "panel" ? await Promise.all([
    prisma.workshopWorkOrder.count({ where: { organizationId: ctx.organizationId, estado: { notIn: ["ENTREGADA", "CANCELADA"] } } }),
    prisma.workshopWorkOrder.count({ where: { organizationId: ctx.organizationId, estado: "LISTA_PARA_ENTREGA" } }),
    prisma.workshopQuote.count({ where: { organizationId: ctx.organizationId, estado: { in: ["BORRADOR", "ENVIADA"] } } }),
    prisma.workshopVehicle.count({ where: { organizationId: ctx.organizationId } }),
    prisma.workshopPurchase.count({ where: { organizationId: ctx.organizationId } }),
  ]) : null;

  const rows = tab.id === "orders" ? await prisma.workshopWorkOrder.findMany({ where: { organizationId: ctx.organizationId, ...createdAt,
      ...(q ? { OR: [{ folio: { contains: q, mode: "insensitive" as const } }, { fallaReportada: { contains: q, mode: "insensitive" as const } }] } : {}),
      ...(client ? { customer: { OR: [{ name: { contains: client, mode: "insensitive" as const } }, { phone: { contains: client } }] } } : {}),
      ...(vehicle ? { vehicle: { OR: [{ marca: { contains: vehicle, mode: "insensitive" as const } }, { modelo: { contains: vehicle, mode: "insensitive" as const } }, { placas: { contains: vehicle, mode: "insensitive" as const } }] } } : {}),
    }, select: { id: true, folio: true, estado: true, createdAt: true, kilometrajeIngreso: true, nivelCombustible: true, fallaReportada: true, diagnostico: true, checklistRecepcion: true, customer: { select: { name: true } }, vehicle: { select: { id: true, placas: true, marca: true, modelo: true } } }, take: 50, orderBy: { createdAt: "desc" } })
    : tab.id === "vehicles" ? await prisma.workshopVehicle.findMany({ where: { organizationId: ctx.organizationId, ...createdAt,
      ...(q ? { OR: [{ marca: { contains: q, mode: "insensitive" as const } }, { modelo: { contains: q, mode: "insensitive" as const } }, { placas: { contains: q, mode: "insensitive" as const } }, { vin: { contains: q, mode: "insensitive" as const } }] } : {}),
      ...(vehicle ? { AND: [{ OR: [{ marca: { contains: vehicle, mode: "insensitive" as const } }, { modelo: { contains: vehicle, mode: "insensitive" as const } }, { placas: { contains: vehicle, mode: "insensitive" as const } }] }] } : {}),
      ...(client ? { customer: { OR: [{ name: { contains: client, mode: "insensitive" as const } }, { phone: { contains: client } }] } } : {}),
    }, select: { id: true, placas: true, vin: true, marca: true, modelo: true, createdAt: true }, take: 50, orderBy: { createdAt: "desc" } })
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
  const pendingWhere: Prisma.WorkshopLeadRequestWhereInput = {
    organizationId: ctx.organizationId, discardedAt: null, quote: { is: null },
  };
  const filteredPendingWhere: Prisma.WorkshopLeadRequestWhereInput = {
    ...pendingWhere, ...createdAt,
    AND: [
      ...(q ? [{ OR: [{ servicioFalla: { contains: q, mode: "insensitive" as const } }, { lead: { name: { contains: q, mode: "insensitive" as const } } }, { lead: { phone: { contains: q } } }] }] : []),
      ...(client ? [{ lead: { OR: [{ name: { contains: client, mode: "insensitive" as const } }, { phone: { contains: client } }] } }] : []),
      ...(vehicle ? [{ OR: [{ marca: { contains: vehicle, mode: "insensitive" as const } }, { modelo: { contains: vehicle, mode: "insensitive" as const } }, { placas: { contains: vehicle, mode: "insensitive" as const } }] }] : []),
    ],
  };
  const [pendingRequests, totalRequests] = await Promise.all([
    prisma.workshopLeadRequest.count({ where: pendingWhere }),
    tab.id === "quotes" && quoteView === "pending" ? prisma.workshopLeadRequest.count({ where: filteredPendingWhere }) : Promise.resolve(0),
  ]);
  const currentRequestPage = Math.min(requestPage, Math.max(1, Math.ceil(totalRequests / requestPageSize)));
  const workshopRequests = tab.id === "quotes" && quoteView === "pending"
    ? await prisma.workshopLeadRequest.findMany({ where: filteredPendingWhere, select: { id: true, vehicleId: true, viewedAt: true, createdAt: true, placas: true, marca: true, modelo: true, anio: true, kilometraje: true, servicioFalla: true, lead: { select: { id: true, name: true, phone: true } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (currentRequestPage - 1) * requestPageSize, take: requestPageSize })
    : [];
  const settings = tab.id === "settings" && ctx.canManageFinancials
    ? await prisma.workshopSettings.findUnique({ where: { organizationId: ctx.organizationId }, select: { vigenciaDias: true, garantiaDias: true, garantiaKm: true } })
    : null;
  const services = tab.id === "settings" && ctx.canManageFinancials
    ? await prisma.workshopService.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, nameEs: true, nameEn: true, costoNeto: true, precioVentaNeto: true, active: true, provisional: true }, orderBy: { nameEs: "asc" } })
    : [];
  const states = ["BORRADOR", "ENVIADA", "APROBADA", "RECHAZADA", "VENCIDA", "CONVERTIDA"] as const;
  const status = states.find((value) => value === query.status);
  const quoteWhere: Prisma.WorkshopQuoteWhereInput = {
    organizationId: ctx.organizationId, ...createdAt,
    ...(status ? { estado: status } : {}),
    ...(client ? { customer: { OR: [{ name: { contains: client, mode: "insensitive" } }, { phone: { contains: client } }] } } : {}),
    ...(vehicle ? { vehicle: { OR: [{ marca: { contains: vehicle, mode: "insensitive" } }, { modelo: { contains: vehicle, mode: "insensitive" } }, { placas: { contains: vehicle, mode: "insensitive" } }, { vin: { contains: vehicle, mode: "insensitive" } }] } } : {}),
    ...(q ? { OR: [{ folio: { contains: q, mode: "insensitive" } }, { servicioTitulo: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const quoteTotal = tab.id === "quotes" && quoteView === "mine" && ctx.canPrintQuotes ? await prisma.workshopQuote.count({ where: quoteWhere }) : 0;
  const quotePage = Math.min(requestPage, Math.max(1, Math.ceil(quoteTotal / 15)));
  const quoteSelect = { id: true, folio: true, estado: true, servicioTitulo: true, total: true, incluyeIva: true, enviadaEn: true, vigenciaDias: true, createdAt: true,
    customer: { select: { name: true, phone: true } }, vehicle: { select: { id: true, marca: true, modelo: true, anio: true, placas: true } }, workOrder: { select: { facturaSolicitada: true } } } as const;
  const quotes = tab.id === "quotes" && quoteView === "mine" && ctx.canManageFinancials
    ? await prisma.workshopQuote.findMany({ where: quoteWhere, select: quoteSelect, take: 15, skip: (quotePage - 1) * 15, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    : [];
  const printableQuotes = tab.id === "quotes" && quoteView === "mine" && ctx.canPrintQuotes && !ctx.canManageFinancials
    ? await prisma.workshopQuote.findMany({ where: quoteWhere, select: { id: true, folio: true, estado: true, servicioTitulo: true, total: true, incluyeIva: true, enviadaEn: true, vigenciaDias: true, createdAt: true, customer: { select: { name: true, phone: true } }, vehicle: { select: { id: true, marca: true, modelo: true, anio: true, placas: true } }, workOrder: { select: { facturaSolicitada: true } } }, take: 15, skip: (quotePage - 1) * 15, orderBy: [{ createdAt: "desc" }, { id: "desc" }] })
    : [];
  const inventoryParts = tab.id === "inventory" && ctx.canManageFinancials
    ? await prisma.workshopPart.findMany({ where: { organizationId: ctx.organizationId, ...createdAt, ...(q ? { OR: [{ sku: { contains: q, mode: "insensitive" } }, { nombre: { contains: q, mode: "insensitive" } }] } : {}) }, select: { id: true, sku: true, nombre: true, unidad: true, costoNeto: true, precioVentaNeto: true, stockMinimo: true }, orderBy: { nombre: "asc" }, take: 200 })
    : [];
  const movements = inventoryParts.length ? await prisma.workshopInventoryMovement.findMany({ where: { organizationId: ctx.organizationId, partId: { in: inventoryParts.map((part) => part.id) } }, select: { partId: true, tipo: true, cantidad: true } }) : [];
  const stock = new Map<string, Prisma.Decimal>();
  for (const movement of movements) stock.set(movement.partId, (stock.get(movement.partId) ?? new Prisma.Decimal(0)).plus(movement.tipo === "SALIDA_ORDEN" ? movement.cantidad.neg() : movement.cantidad));
  const purchaseParts = tab.id === "purchases" && ctx.canManageFinancials
    ? await prisma.workshopPart.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, sku: true, nombre: true, costoNeto: true }, orderBy: { nombre: "asc" }, take: 200 })
    : [];
  const purchases = tab.id === "purchases" && ctx.canManageFinancials
    ? await prisma.workshopPurchase.findMany({ where: { organizationId: ctx.organizationId, ...(Object.keys(dateRange).length ? { fecha: dateRange } : {}), ...(q ? { OR: [{ proveedor: { contains: q, mode: "insensitive" } }, { folioProveedor: { contains: q, mode: "insensitive" } }] } : {}), ...(client ? { workOrder: { customer: { OR: [{ name: { contains: client, mode: "insensitive" } }, { phone: { contains: client } }] } } } : {}), ...(vehicle ? { workOrder: { vehicle: { OR: [{ marca: { contains: vehicle, mode: "insensitive" } }, { modelo: { contains: vehicle, mode: "insensitive" } }, { placas: { contains: vehicle, mode: "insensitive" } }] } } } : {}) }, select: { id: true, proveedor: true, fecha: true, total: true }, orderBy: { fecha: "desc" }, take: 50 })
    : [];
  const cashRows = tab.id === "cash" && ctx.canManageFinancials
    ? await prisma.workshopCashMovement.findMany({ where: { organizationId: ctx.organizationId, ...(Object.keys(dateRange).length ? { fecha: dateRange } : {}), ...(q ? { concepto: { contains: q, mode: "insensitive" } } : {}), ...(client ? { workOrder: { customer: { OR: [{ name: { contains: client, mode: "insensitive" } }, { phone: { contains: client } }] } } } : {}), ...(vehicle ? { workOrder: { vehicle: { OR: [{ marca: { contains: vehicle, mode: "insensitive" } }, { modelo: { contains: vehicle, mode: "insensitive" } }, { placas: { contains: vehicle, mode: "insensitive" } }] } } } : {}) }, select: { id: true, fecha: true, tipo: true, concepto: true, monto: true, metodo: true }, orderBy: { fecha: "desc" }, take: 50 })
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
  const pageHref = (page: number) => {
    const params = new URLSearchParams({ tab: tab.id, page: String(page) });
    if (tab.id === "quotes") params.set("view", quoteView);
    for (const key of ["q", "client", "vehicle", "from", "to", "status"] as const) if (query[key]) params.set(key, query[key]);
    return `/portal/workshop?${params}`;
  };

  return (
    <div className="space-y-5">
      <header className="rounded-xl border border-[#04275A] bg-gradient-to-br from-[#031738] via-[#04275A] to-[#063C82] px-5 py-6 text-white sm:px-8">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-200"><Wrench className="h-4 w-4" />{ctx.orgName}</p>
        <h1 className="mt-2 text-2xl font-bold sm:text-4xl">{es ? "Reymen Talleres" : "Reymen Workshop"}</h1>
        <p className="mt-1 text-sm text-white/80">{es ? "Vehículos, trabajos y caja en un solo lugar" : "Vehicles, jobs and cash in one place"}</p>
      </header>
      <WorkshopTabs tabs={tabs} selected={tab.id} lang={ctx.lang} pending={pendingRequests} />
      {["orders", "vehicles", "contacts", "inventory", "purchases", "cash"].includes(tab.id) && <WorkshopFilters lang={ctx.lang} tab={tab.id} values={filterValues} />}
      {counts && <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[
        [es ? "Órdenes activas" : "Active orders", counts[0]],
        [es ? "Listas para entregar" : "Ready for delivery", counts[1]],
        [es ? "Cotizaciones pendientes" : "Pending quotes", counts[2]],
        [es ? "Vehículos" : "Vehicles", counts[3]],
        [es ? "Compras" : "Purchases", counts[4]],
      ].map(([label, value], index) => <div key={String(label)} className={`rounded-xl border border-slate-200 bg-white p-4 ${index === 4 ? "col-span-2 lg:col-span-1" : ""}`}><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-900">{value}</p></div>)}</div>}
      {balance !== null && <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{es ? "Balance de caja" : "Cash balance"}</p><p className="text-xl font-bold">${balance.toFixed(2)} MXN</p></div><div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{es ? "Ingresos de hoy" : "Today's income"}</p><p className="text-xl font-bold">${(cashTotals?.[2]._sum.monto ?? new Prisma.Decimal(0)).toFixed(2)} MXN</p></div></div>}
      {tab.id === "vehicles" && ctx.canManageFinancials && <CreateVehicleForm lang={ctx.lang} customers={customers} />}
      {tab.id === "quotes" && <>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-900 dark:text-white">{es ? "Cotizaciones" : "Quotes"}</h2>{ctx.canManageFinancials && <Link href="/portal/workshop/quotes/new" className="inline-flex items-center gap-2 rounded-md bg-[#245A9F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1C4A84]"><Plus className="h-4 w-4" />{es ? "Nueva cotización" : "New quote"}</Link>}</div>
        <WorkshopQuoteSections lang={ctx.lang} view={quoteView} pending={pendingRequests} />
        <WorkshopFilters lang={ctx.lang} tab="quotes" view={quoteView} values={filterValues} statusFilter={quoteView === "mine"} />
        {quoteView === "pending" && <><WorkshopRequests lang={ctx.lang} requests={workshopRequests} canManage={ctx.canManageFinancials} canReview={ctx.canPrintQuotes} now={new Date()} />
          {totalRequests > requestPageSize && <nav aria-label={es ? "Páginas de solicitudes" : "Request pages"} className="flex items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-800"><span>{es ? "Página" : "Page"} {currentRequestPage} / {Math.ceil(totalRequests / requestPageSize)} · {totalRequests}</span><div className="flex gap-2">{currentRequestPage > 1 && <Link className="rounded border border-slate-300 px-3 py-1 text-[#981C25]" href={pageHref(currentRequestPage - 1)}>{es ? "Anterior" : "Previous"}</Link>}{currentRequestPage * requestPageSize < totalRequests && <Link className="rounded border border-slate-300 px-3 py-1 text-[#981C25]" href={pageHref(currentRequestPage + 1)}>{es ? "Siguiente" : "Next"}</Link>}</div></nav>}
        </>}
      </>}
      {tab.id === "contacts" && <WorkshopContactsTable lang={ctx.lang} customers={contactCustomers} leads={contactLeads} />}
      {tab.id === "settings" && ctx.canManageFinancials && <WorkshopSettingsForm lang={ctx.lang} defaults={settings ?? { vigenciaDias: 15, garantiaDias: 90, garantiaKm: 5000 }} />}
      {tab.id === "settings" && ctx.canManageFinancials && <WorkshopServices lang={ctx.lang} services={services.map((service) => ({ ...service, costoNeto: service.costoNeto?.toFixed(2) ?? "", precioVentaNeto: service.precioVentaNeto?.toFixed(2) ?? "" }))} />}
      {tab.id === "inventory" && ctx.canManageFinancials && <CreatePartForm lang={ctx.lang} />}
      {tab.id === "inventory" && ctx.canManageFinancials && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Existencias" : "Stock"}</h2><ul className="mt-3 divide-y divide-slate-100">{inventoryParts.map((part) => { const qty = stock.get(part.id) ?? new Prisma.Decimal(0); return <li key={part.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{part.sku} · {part.nombre}</span><span className={qty.lt(part.stockMinimo) ? "font-semibold text-red-700" : "font-semibold"}>{qty.toString()} {part.unidad}</span></li>; })}</ul></section>}
      {tab.id === "purchases" && ctx.canManageFinancials && <CreatePurchaseForm lang={ctx.lang} parts={purchaseParts.map((part) => ({ ...part, costoNeto: part.costoNeto.toString() }))} />}
      {purchases.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Compras" : "Purchases"}</h2><ul className="mt-3 divide-y divide-slate-100">{purchases.map((purchase) => <li key={purchase.id} className="flex justify-between gap-2 py-2 text-sm"><span>{purchase.proveedor} · {purchase.fecha.toLocaleDateString(es ? "es-MX" : "en-US")}</span><span>${purchase.total.toFixed(2)} MXN</span></li>)}</ul></section>}
      {cashRows.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Movimientos de caja" : "Cash movements"}</h2><ul className="mt-3 divide-y divide-slate-100">{cashRows.map((movement) => <li key={movement.id} className="flex justify-between gap-2 py-2 text-sm"><span>{movement.concepto} · {movement.metodo}</span><span className={movement.tipo === "EGRESO" ? "text-red-700" : "text-emerald-700"}>{movement.tipo === "EGRESO" ? "−" : "+"}${movement.monto.toFixed(2)} MXN</span></li>)}</ul></section>}
      {tab.id === "quotes" && quoteView === "mine" && <section className="rounded-xl border border-slate-300 bg-white p-4"><div className="space-y-3">{(ctx.canManageFinancials ? quotes : printableQuotes).map((quote) => <article key={quote.id} className="rounded-lg border border-slate-300 p-4 text-sm text-slate-800"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs text-slate-500">{es ? "Folio / cliente" : "Number / customer"}</span><p className="font-semibold">{quote.folio || (es ? "Borrador sin folio" : "Draft without number")}</p><p>{quote.customer.name || quote.customer.phone}</p></div><div><span className="text-xs text-slate-500">{es ? "Vehículo / servicio" : "Vehicle / service"}</span><p>{quote.vehicle.marca} {quote.vehicle.modelo} {quote.vehicle.anio} · {quote.vehicle.placas || "—"}</p><p className="font-medium">{quote.servicioTitulo}</p></div><div><span className="text-xs text-slate-500">{es ? "Vigencia / fecha" : "Validity / date"}</span><p>{validityLabel(quote.enviadaEn, quote.vigenciaDias, now, es)}</p><p>{quote.createdAt.toLocaleDateString(es ? "es-MX" : "en-US")}</p></div><div><span className="text-xs text-slate-500">{es ? "Estado / total con IVA" : "Status / total with tax"}</span><p className="font-semibold">{quote.estado}</p><p>${Number(quote.total).toFixed(2)} MXN · {quote.incluyeIva ? (es ? "con IVA" : "with VAT") : (es ? "sin IVA" : "without VAT")}</p></div></div>{!quote.incluyeIva && quote.workOrder?.facturaSolicitada && <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-950">{es ? "El cliente solicitó factura y esta cotización está sin IVA. Revisa antes de continuar." : "The customer requested an invoice and this quote has no VAT. Review before proceeding."}</p>}<div className="mt-3 border-t border-slate-200 pt-3">{ctx.canManageFinancials ? <QuoteActions id={quote.id} folio={quote.folio} estado={quote.estado} lang={ctx.lang} /> : quote.folio ? <a href={`/api/workshop/quotes/${quote.id}/pdf?print=1`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#981C25] underline">{es ? "Abrir PDF para imprimir" : "Open PDF to print"}</a> : <span className="text-xs text-slate-500">{es ? "El administrador debe emitir el folio" : "An administrator must issue the number"}</span>}</div></article>)}{quoteTotal === 0 && <p className="rounded-lg bg-slate-50 p-5 text-sm text-slate-700">{es ? "No hay cotizaciones para estos filtros." : "No quotes match these filters."}</p>}</div>{quoteTotal > 15 && <nav className="mt-4 flex items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm text-slate-700"><span>{es ? "Página" : "Page"} {quotePage} / {Math.ceil(quoteTotal / 15)}</span><div className="flex gap-2">{quotePage > 1 && <Link href={pageHref(quotePage - 1)} className="text-[#981C25] underline">{es ? "Anterior" : "Previous"}</Link>}{quotePage * 15 < quoteTotal && <Link href={pageHref(quotePage + 1)} className="text-[#981C25] underline">{es ? "Siguiente" : "Next"}</Link>}</div></nav>}</section>}
      {rows.length > 0 ? <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? tab.es : tab.en}</h2><ul className="mt-3 divide-y divide-slate-100">{rows.map((row) => <li key={row.id} className="py-3 text-sm text-slate-700">{"folio" in row ? <><strong className="block text-base text-slate-900">{row.folio} · {row.vehicle.placas ?? `${row.vehicle.marca ?? ""} ${row.vehicle.modelo ?? ""}`} · {row.customer.name ?? (es ? "Cliente" : "Customer")}</strong><Link href={`/portal/workshop/vehicles/${row.vehicle.id}`} className="mt-1 inline-block text-xs font-semibold text-red-800 underline">{es ? "Ver historial y revisiones recomendadas" : "View history and suggested checks"}</Link><OrderOperations id={row.id} estado={row.estado} kilometrajeIngreso={row.kilometrajeIngreso} nivelCombustible={row.nivelCombustible} fallaReportada={row.fallaReportada} diagnostico={row.diagnostico} checklist={{ danosPrevios: checklistField(row.checklistRecepcion, "danosPrevios"), testigos: checklistField(row.checklistRecepcion, "testigos"), pertenencias: checklistField(row.checklistRecepcion, "pertenencias") }} saldo={balanceByOrder.get(row.id)} facturaSolicitada={invoiceByOrder.get(row.id)} canManageFinancials={ctx.canManageFinancials} lang={ctx.lang} />{ctx.canManageFinancials && ["DIAGNOSTICO", "EN_REPARACION"].includes(row.estado) && <AddAuthorizedLine orderId={row.id} parts={authorizedLineParts} lang={ctx.lang} />}</> : <Link href={`/portal/workshop/vehicles/${row.id}`} className="font-medium text-red-700 underline">{row.placas ?? "—"} · {row.marca ?? ""} {row.modelo ?? ""} · {row.vin ?? "—"}</Link>}</li>)}</ul></section>
      : tab.id !== "panel" && tab.id !== "quotes" && tab.id !== "vehicles" && <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{es ? "No hay registros en esta sección todavía. Los formularios y operaciones están en desarrollo; este módulo aún no está listo para usarse en producción." : "There are no records in this section yet. Forms and operations are in development; this module is not ready for production use."}</div>}
    </div>
  );
}
