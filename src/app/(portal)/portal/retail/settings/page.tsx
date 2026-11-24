import { redirect } from "next/navigation";
import { getRetailContext } from "@/lib/retail/context";
import { prisma } from "@/lib/prisma";
import { AttachLocationForm, LocationForm } from "@/components/retail/RetailForms";

export default async function RetailSettingsPage() {
  const ctx = await getRetailContext();
  if (!ctx.canManage) redirect("/portal/retail");
  const [locations, unconfiguredBranches] = await Promise.all([
    prisma.retailLocationSettings.findMany({ where: { organizationId: ctx.organizationId }, select: { branchId: true, type: true, format: true, branch: { select: { name: true, isActive: true } }, whatsappPhone: true }, orderBy: { createdAt: "asc" } }),
    prisma.branch.findMany({ where: { organizationId: ctx.organizationId, retailLocation: null }, select: { id: true, name: true, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  const en = ctx.lang === "en";
  return <div className="space-y-5">
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5"><h2 className="text-lg font-semibold">{en ? "Locations" : "Ubicaciones"}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{en ? "Retail locations share the platform's branch records. Add only confirmed locations and details." : "Las ubicaciones Retail comparten las sucursales de la plataforma. Agrega solo ubicaciones y datos confirmados."}</p>
      <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">{locations.map((l) => <li key={l.branchId} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-semibold">{l.branch.name}</span><span className="text-slate-600 dark:text-slate-300">{l.type} · {l.format} · {l.branch.isActive ? (en ? "Active" : "Activa") : (en ? "Inactive" : "Inactiva")}{l.whatsappPhone ? ` · WhatsApp ${l.whatsappPhone}` : ""}</span></li>)}</ul>
      {locations.length === 0 && <p className="py-4 text-sm text-slate-500">{en ? "No Retail locations yet." : "Aún no hay ubicaciones Retail."}</p>}
    </section>
    {unconfiguredBranches.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5"><h2 className="mb-1 text-lg font-semibold">{en ? "Use an existing branch" : "Usar una sucursal existente"}</h2><p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{en ? "Connect a branch already used elsewhere in Reymen without creating a duplicate." : "Conecta una sucursal que ya existe en Reymen sin duplicarla."}</p><AttachLocationForm lang={ctx.lang} branches={unconfiguredBranches} /></section>}
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 sm:p-5"><h2 className="mb-4 text-lg font-semibold">{en ? "Add a new location" : "Agregar una ubicación nueva"}</h2><LocationForm lang={ctx.lang} /></section>
  </div>;
}
