import { getRetailContext } from "@/lib/retail/context";

export default async function RetailPage() {
  const { lang } = await getRetailContext();
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
        {lang === "en" ? "Overview" : "Panel"}
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {lang === "en"
          ? "Inventory and sales will appear here when they are registered."
          : "El inventario y las ventas aparecerán aquí cuando se registren."}
      </p>
    </section>
  );
}
