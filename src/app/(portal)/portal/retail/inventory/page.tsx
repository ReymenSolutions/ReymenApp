import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getRetailContext } from "@/lib/retail/context";
import { ItemForm } from "@/components/retail/RetailForms";
import { UrlPagination } from "@/components/shared/Pagination";
import { parsePaging } from "@/lib/paging";

type Search = { q?: string; page?: string; ps?: string };

export default async function RetailInventoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const ctx = await getRetailContext();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const { page, pageSize } = parsePaging(sp, 25);
  const where = { organizationId: ctx.organizationId, ...(q ? { code: { contains: q, mode: "insensitive" as const } } : {}) };
  const [warehouses, rows, total] = await Promise.all([
    prisma.retailLocationSettings.findMany({ where: { organizationId: ctx.organizationId, type: "BODEGA", branch: { isActive: true } }, select: { branchId: true, branch: { select: { name: true } } } }),
    prisma.retailItem.findMany({ where, select: { id: true, code: true, brand: true, garmentType: true, size: true, status: true, salePrice: true, cost: true, location: { select: { name: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.retailItem.count({ where }),
  ]);
  const en = ctx.lang === "en";
  return <div className="space-y-5">
    {ctx.canOperate && <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5">
      <h2 className="text-lg font-semibold">{en ? "Register one physical item" : "Dar de alta una pieza física"}</h2>
      <p className="mb-4 mt-1 text-sm text-slate-600 dark:text-slate-300">{en ? "Every item needs a unique code. Photo and QR label are coming in the next cut." : "Cada pieza necesita un código único. Foto y etiqueta QR llegarán en el siguiente corte."}</p>
      {warehouses.length ? <ItemForm lang={ctx.lang} canManage={ctx.canManage} warehouses={warehouses.map((w) => ({ id: w.branchId, name: w.branch.name }))} /> : <p className="text-sm text-amber-700 dark:text-amber-300">{en ? "Add an active warehouse in Settings before registering items." : "Agrega una bodega activa en Configuración antes de dar de alta prendas."} <Link className="underline" href="/portal/retail/settings">{en ? "Settings" : "Configuración"}</Link></p>}
    </section>}
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{en ? "Inventory" : "Inventario"}</h2><p className="text-sm text-slate-600 dark:text-slate-300">{total} {en ? "items" : "piezas"}</p></div>
        <form className="flex gap-2" action="/portal/retail/inventory"><input name="q" defaultValue={q} placeholder={en ? "Search code" : "Buscar código"} className="min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white" /><button className="rounded-lg bg-[#04275A] px-3 py-2 text-sm font-medium text-white">{en ? "Search" : "Buscar"}</button></form></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b text-slate-500 dark:text-slate-300"><tr><th className="py-2">{en ? "Code" : "Código"}</th><th>{en ? "Item" : "Prenda"}</th><th>{en ? "Location" : "Ubicación"}</th><th>{en ? "Status" : "Estado"}</th><th className="text-right">{en ? "Price" : "Precio"}</th>{ctx.canManage && <th className="text-right">{en ? "Cost" : "Costo"}</th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800"><td className="py-3 font-semibold">{row.code}</td><td>{[row.brand, row.garmentType, row.size].filter(Boolean).join(" · ") || "—"}</td><td>{row.location.name}</td><td>{row.status.replaceAll("_", " ")}</td><td className="text-right">${row.salePrice.toFixed(2)}</td>{ctx.canManage && <td className="text-right">{row.cost == null ? "—" : `$${row.cost.toFixed(2)}`}</td>}</tr>)}</tbody></table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{en ? "No items found." : "No se encontraron piezas."}</p>}</div>
      <UrlPagination page={page} pageSize={pageSize} total={total} />
    </section>
  </div>;
}
