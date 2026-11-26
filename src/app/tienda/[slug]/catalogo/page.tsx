import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStorefront } from "@/lib/retail/public/source";
import { applyFilters, facets, parseFilters, splitStores } from "@/lib/retail/public/catalog";
import { CatalogFilters } from "@/components/retail-public/CatalogFilters";
import { ItemCard } from "@/components/retail-public/ItemCard";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getStorefront(slug);
  return shop ? { title: `Catálogo · ${shop.orgName}` } : { title: "Catálogo", robots: { index: false } };
}

// Catálogo: solo piezas publicables (DISPONIBLES, con foto, en tienda activa), con filtros por URL.
export default async function CatalogoPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const shop = await getStorefront(slug);
  if (!shop) notFound();
  const filters = parseFilters(sp);
  const items = applyFilters(shop.items, filters);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold text-[var(--rt-navy)]">Catálogo</h1>
      <CatalogFilters slug={slug} stores={splitStores(shop.stores).active} facets={facets(shop.items)} value={filters} />
      <p className="text-sm text-[var(--rt-muted)]">{items.length === 1 ? "1 pieza disponible" : `${items.length} piezas disponibles`}</p>
      {items.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((i) => <ItemCard key={i.id} item={i} slug={slug} />)}
        </div>
      ) : (
        <p className="rounded-2xl bg-[var(--rt-surface)] p-6 text-center text-[var(--rt-muted)]">No hay piezas con esos filtros.</p>
      )}
    </div>
  );
}
