import Link from "next/link";
import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { getWorkshopContext } from "@/lib/workshop/context";
import { prisma } from "@/lib/prisma";
import { CreateVehicleForm } from "@/components/workshop/CreateVehicleForm";
import { CreateQuoteForm } from "@/components/workshop/CreateQuoteForm";

type Tab = "panel" | "quotes" | "orders" | "vehicles" | "inventory" | "purchases" | "cash" | "settings";

const TABS: { id: Tab; es: string; en: string; financial?: boolean }[] = [
  { id: "panel", es: "Panel", en: "Overview", financial: true },
  { id: "quotes", es: "Cotizaciones", en: "Quotes", financial: true },
  { id: "orders", es: "Órdenes", en: "Orders" },
  { id: "vehicles", es: "Vehículos", en: "Vehicles" },
  { id: "inventory", es: "Inventario", en: "Inventory", financial: true },
  { id: "purchases", es: "Compras", en: "Purchases", financial: true },
  { id: "cash", es: "Caja", en: "Cash", financial: true },
  { id: "settings", es: "Configuración", en: "Settings", financial: true },
];

export default async function WorkshopPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const ctx = await getWorkshopContext();
  const es = ctx.lang === "es";
  const selected = (await searchParams).tab ?? "panel";
  const tab = TABS.find((item) => item.id === selected) ?? TABS[0];
  if (tab.financial && !ctx.canManageFinancials) redirect("/portal/workshop?tab=orders");
  const tabs = TABS.filter((item) => ctx.canManageFinancials || !item.financial);

  const counts = tab.id === "panel" ? await Promise.all([
    prisma.workshopWorkOrder.count({ where: { organizationId: ctx.organizationId, estado: { notIn: ["ENTREGADA", "CANCELADA"] } } }),
    prisma.workshopWorkOrder.count({ where: { organizationId: ctx.organizationId, estado: "LISTA_PARA_ENTREGA" } }),
    prisma.workshopQuote.count({ where: { organizationId: ctx.organizationId, estado: { in: ["BORRADOR", "ENVIADA"] } } }),
    prisma.workshopVehicle.count({ where: { organizationId: ctx.organizationId } }),
    prisma.workshopPurchase.count({ where: { organizationId: ctx.organizationId } }),
  ]) : null;

  const rows = tab.id === "orders" ? await prisma.workshopWorkOrder.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, folio: true, estado: true, createdAt: true }, take: 50, orderBy: { createdAt: "desc" } })
    : tab.id === "vehicles" ? await prisma.workshopVehicle.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, placas: true, vin: true, marca: true, modelo: true, createdAt: true }, take: 50, orderBy: { createdAt: "desc" } })
    : [];
  const customers = tab.id === "vehicles" && ctx.canManageFinancials
    ? await prisma.customer.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, name: true, phone: true }, orderBy: { createdAt: "desc" }, take: 200 })
    : [];
  const quoteVehicles = tab.id === "quotes" && ctx.canManageFinancials
    ? await prisma.workshopVehicle.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, placas: true, vin: true, customer: { select: { name: true, phone: true } } }, take: 200, orderBy: { createdAt: "desc" } })
    : [];
  const quotes = tab.id === "quotes" && ctx.canManageFinancials
    ? await prisma.workshopQuote.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, folio: true, estado: true, servicioTitulo: true, subtotalNeto: true, iva: true, total: true }, take: 50, orderBy: { createdAt: "desc" } })
    : [];

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
      {tab.id === "vehicles" && ctx.canManageFinancials && <CreateVehicleForm lang={ctx.lang} customers={customers} />}
      {tab.id === "quotes" && ctx.canManageFinancials && <CreateQuoteForm lang={ctx.lang} vehicles={quoteVehicles} />}
      {quotes.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? "Cotizaciones" : "Quotes"}</h2><ul className="mt-3 divide-y divide-slate-100">{quotes.map((quote) => <li key={quote.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span>{quote.folio ?? (es ? "Sin folio" : "No number")} · {quote.servicioTitulo} · {quote.estado}</span><span className="font-semibold">${Number(quote.total).toFixed(2)} MXN</span></li>)}</ul></section>}
      {rows.length > 0 ? <section className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-semibold">{es ? tab.es : tab.en}</h2><ul className="mt-3 divide-y divide-slate-100">{rows.map((row) => <li key={row.id} className="py-2 text-sm text-slate-700">{"folio" in row ? `${row.folio} · ${row.estado}` : `${row.placas ?? "—"} · ${row.marca ?? ""} ${row.modelo ?? ""} · ${row.vin ?? "—"}`}</li>)}</ul></section>
      : tab.id !== "panel" && tab.id !== "quotes" && tab.id !== "vehicles" && <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">{es ? "No hay registros en esta sección todavía. Los formularios y operaciones están en desarrollo; este módulo aún no está listo para usarse en producción." : "There are no records in this section yet. Forms and operations are in development; this module is not ready for production use."}</div>}
    </div>
  );
}
