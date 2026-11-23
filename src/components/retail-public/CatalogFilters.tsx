import type { CatalogFilters as Filters, Facets } from "@/lib/retail/public/catalog";
import type { PublicStore } from "@/lib/retail/public/types";

// Filtros por URL con un formulario GET: funcionan sin JavaScript y el enlace se puede compartir por WhatsApp.
export function CatalogFilters({ slug, stores, facets, value }: { slug: string; stores: PublicStore[]; facets: Facets; value: Filters }) {
  const field = "w-full rounded-xl border border-[var(--rt-line)] bg-[var(--rt-surface)] px-3 py-2.5 text-sm text-[var(--rt-ink)]";
  const select = (name: string, label: string, options: { value: string; label: string }[], current?: string) => (
    <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--rt-muted)]">
      {label}
      <select name={name} defaultValue={current ?? ""} className={field}>
        <option value="">Todas</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  const opts = (vals: string[]) => vals.map((v) => ({ value: v, label: v }));
  return (
    <form method="get" action={`/tienda/${slug}/catalogo`} className="grid grid-cols-2 gap-3 rounded-2xl border border-[var(--rt-line)] bg-[var(--rt-surface)] p-4 sm:grid-cols-4 lg:grid-cols-8">
      <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-[var(--rt-muted)]">
        Buscar
        <input name="q" type="search" defaultValue={value.q ?? ""} placeholder="Marca, prenda, color…" className={field} />
      </label>
      {select("tienda", "Tienda", stores.map((s) => ({ value: s.id, label: s.name })), value.store)}
      {select("categoria", "Categoría", opts(facets.categories), value.category)}
      {select("talla", "Talla", opts(facets.sizes), value.size)}
      {select("color", "Color", opts(facets.colors), value.color)}
      {select("marca", "Marca", opts(facets.brands), value.brand)}
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--rt-muted)]">
        Ordenar
        <select name="orden" defaultValue={value.sort === "price_asc" ? "precio_asc" : value.sort === "price_desc" ? "precio_desc" : ""} className={field}>
          <option value="">Más nuevo</option>
          <option value="precio_asc">Menor precio</option>
          <option value="precio_desc">Mayor precio</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--rt-muted)]">
        Precio mín.
        <input name="min" inputMode="numeric" defaultValue={value.min ?? ""} className={field} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--rt-muted)]">
        Precio máx.
        <input name="max" inputMode="numeric" defaultValue={value.max ?? ""} className={field} />
      </label>
      <div className="col-span-2 flex items-end gap-2 sm:col-span-2">
        <button type="submit" className="flex-1 rounded-xl bg-[var(--rt-royal)] px-4 py-2.5 text-sm font-bold text-white hover:bg-[var(--rt-royal-dark)]">Aplicar</button>
        <a href={`/tienda/${slug}/catalogo`} className="rounded-xl border border-[var(--rt-line)] px-4 py-2.5 text-sm font-semibold text-[var(--rt-muted)]">Limpiar</a>
      </div>
    </form>
  );
}
