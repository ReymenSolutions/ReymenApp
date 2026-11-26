import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getStorefront } from "@/lib/retail/public/source";
import { FORMAT_DESCRIPTION, splitStores } from "@/lib/retail/public/catalog";
import { ItemCard } from "@/components/retail-public/ItemCard";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const shop = await getStorefront(slug);
  if (!shop) return { title: "Tienda", robots: { index: false } };
  const names = splitStores(shop.stores).active.map((s) => s.name).join(" · ");
  return { title: `${shop.orgName} · Tienda en línea`, description: `Aparta en línea en ${names}.`, openGraph: { title: `${shop.orgName} · Tienda en línea` } };
}

// Inicio: las tiendas del grupo (las inactivas como «Próximamente», sin catálogo) y lo más nuevo.
export default async function TiendaHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getStorefront(slug);
  if (!shop) notFound();
  const { active, comingSoon } = splitStores(shop.stores);
  const latest = shop.items.slice(0, 8);
  return (
    <div className="space-y-10">
      <section className="text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-[var(--rt-navy)] sm:text-4xl">{shop.orgName}</h1>
        <p className="mx-auto mt-2 max-w-xl text-[var(--rt-muted)]">Mira las piezas disponibles, apártalas en línea y recógelas en tienda.</p>
        <Link href={`/tienda/${slug}/catalogo`} className="mt-5 inline-flex rounded-full bg-[var(--rt-royal)] px-6 py-3 font-bold text-white hover:bg-[var(--rt-royal-dark)]">Ver catálogo</Link>
      </section>

      <section aria-label="Tiendas" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((s) => (
          <Link key={s.id} href={`/tienda/${slug}/catalogo?tienda=${s.id}`} className="rounded-2xl border border-[var(--rt-line)] bg-[var(--rt-surface)] p-5 shadow-[var(--rt-shadow)] hover:border-[var(--rt-royal)]">
            <p className="text-xl font-bold text-[var(--rt-navy)]">{s.name}</p>
            <p className="mt-1 text-sm text-[var(--rt-muted)]">{FORMAT_DESCRIPTION[s.format]}</p>
            <p className="mt-4 text-sm font-bold text-[var(--rt-royal)]">Ver piezas →</p>
          </Link>
        ))}
        {comingSoon.map((s) => (
          <div key={s.id} className="rounded-2xl border border-dashed border-[var(--rt-line)] bg-[var(--rt-surface)] p-5 opacity-80">
            <p className="flex items-center gap-2 text-xl font-bold text-[var(--rt-navy)]">
              {s.name}
              <span className="rounded-full bg-[var(--rt-bg)] px-2.5 py-0.5 text-xs font-semibold text-[var(--rt-muted)]">Próximamente</span>
            </p>
            <p className="mt-1 text-sm text-[var(--rt-muted)]">{FORMAT_DESCRIPTION[s.format]}</p>
          </div>
        ))}
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-bold text-[var(--rt-navy)]">Lo más nuevo</h2>
          <Link href={`/tienda/${slug}/catalogo`} className="text-sm font-bold text-[var(--rt-royal)]">Ver todo →</Link>
        </div>
        {latest.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {latest.map((i) => <ItemCard key={i.id} item={i} slug={slug} />)}
          </div>
        ) : (
          <p className="rounded-2xl bg-[var(--rt-surface)] p-6 text-center text-[var(--rt-muted)]">Pronto publicaremos piezas disponibles.</p>
        )}
      </section>
    </div>
  );
}
