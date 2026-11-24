import { getRetailContext } from "@/lib/retail/context";
import { prisma } from "@/lib/prisma";

export default async function RetailPage() {
  const { lang, organizationId } = await getRetailContext();
  const [available, inTransit, waste, stores] = await Promise.all([
    prisma.retailItem.count({ where: { organizationId, status: "DISPONIBLE" } }),
    prisma.retailItem.count({ where: { organizationId, status: "EN_TRASLADO" } }),
    prisma.retailItem.count({ where: { organizationId, status: "MERMA" } }),
    prisma.retailLocationSettings.count({ where: { organizationId, type: "TIENDA", branch: { isActive: true } } }),
  ]);
  const en = lang === "en";
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
        {lang === "en" ? "Overview" : "Panel"}
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {en ? "Current inventory, calculated from registered items. Sales are not available yet." : "Inventario actual, calculado desde las piezas registradas. Las ventas aún no están disponibles."}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: en ? "Available" : "Disponibles", value: available },
          { label: en ? "In transit" : "En traslado", value: inTransit },
          { label: en ? "Waste" : "Mermas", value: waste },
          { label: en ? "Active stores" : "Tiendas activas", value: stores },
        ].map(({ label, value }) => <div key={label} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700"><p className="text-xs text-slate-500 dark:text-slate-300">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p></div>)}
      </div>
    </section>
  );
}
