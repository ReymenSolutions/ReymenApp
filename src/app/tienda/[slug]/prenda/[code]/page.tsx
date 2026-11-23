import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefront } from "@/lib/retail/public/source";
import { formatMXN, itemTitle, waNumber } from "@/lib/retail/public/catalog";
import { HoldForm } from "@/components/retail-public/HoldForm";

async function load(slug: string, code: string) {
  const shop = await getStorefront(slug);
  if (!shop) return null;
  const item = shop.items.find((i) => i.code === decodeURIComponent(code));
  return item ? { shop, item, store: shop.stores.find((s) => s.id === item.storeId) ?? null } : { shop, item: null, store: null };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; code: string }> }): Promise<Metadata> {
  const { slug, code } = await params;
  const data = await load(slug, code);
  if (!data?.item) return { title: "Prenda no disponible", robots: { index: false } };
  const title = `${itemTitle(data.item)} · ${data.shop.orgName}`;
  return { title, description: `${formatMXN(data.item.finalPrice)} en ${data.item.storeName}.`, openGraph: { title, images: [{ url: data.item.photoUrl }] } };
}

// Detalle de una pieza única. Si ya se vendió o la apartó alguien, deja de existir aquí (mismo inventario que el POS).
export default async function PrendaPage({ params }: { params: Promise<{ slug: string; code: string }> }) {
  const { slug, code } = await params;
  const data = await load(slug, code);
  if (!data) notFound();
  const { item, store } = data;
  if (!item) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-[var(--rt-surface)] p-8 text-center">
        <h1 className="text-xl font-bold text-[var(--rt-navy)]">Esta pieza ya no está disponible</h1>
        <p className="mt-2 text-[var(--rt-muted)]">Alguien la apartó o la compró. Cada pieza es única.</p>
        <Link href={`/tienda/${slug}/catalogo`} className="mt-5 inline-flex rounded-full bg-[var(--rt-royal)] px-5 py-2.5 font-bold text-white">Ver catálogo</Link>
      </div>
    );
  }
  const discounted = item.finalPrice < item.salePrice;
  const specs = [
    ["Marca", item.brand], ["Categoría", item.category], ["Prenda", item.garmentType], ["Talla", item.size],
    ["Color", item.color], ["Estilo", item.style], ["Tienda", item.storeName], ["Código", item.code],
  ].filter((r): r is [string, string] => !!r[1]);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="overflow-hidden rounded-2xl border border-[var(--rt-line)] bg-[var(--rt-surface)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- fotos servidas por la app (DEC-03) */}
        <img src={item.photoUrl} alt={itemTitle(item)} className="aspect-[3/4] w-full object-cover" />
      </div>
      <div className="space-y-5">
        <div>
          <Link href={`/tienda/${slug}/catalogo`} className="text-sm font-semibold text-[var(--rt-royal)]">← Catálogo</Link>
          <h1 className="mt-2 text-2xl font-extrabold text-[var(--rt-navy)]">{itemTitle(item)}</h1>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="text-3xl font-extrabold text-[var(--rt-navy)]">{formatMXN(item.finalPrice)}</span>
            {discounted && <span className="text-[var(--rt-muted)] line-through">{formatMXN(item.salePrice)}</span>}
            {discounted && item.discountLabel && <span className="rounded-full bg-[var(--rt-royal)] px-2.5 py-1 text-xs font-bold text-white">{item.discountLabel}</span>}
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--rt-ok)]">Disponible · pieza única</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border border-[var(--rt-line)] bg-[var(--rt-surface)] p-4 text-sm">
          {specs.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--rt-muted)]">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="rounded-2xl border border-[var(--rt-line)] bg-[var(--rt-surface)] p-4">
          <h2 className="mb-3 font-bold text-[var(--rt-navy)]">Apártala</h2>
          <HoldForm slug={slug} code={item.code} storeHasWhatsapp={!!waNumber(store?.whatsappPhone)} />
        </div>
      </div>
    </div>
  );
}
