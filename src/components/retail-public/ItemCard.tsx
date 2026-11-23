import Link from "next/link";
import { formatMXN, itemTitle } from "@/lib/retail/public/catalog";
import type { PublicItem } from "@/lib/retail/public/types";

// Una prenda única por tarjeta: foto real, marca, talla, color, precio y tienda.
export function ItemCard({ item, slug }: { item: PublicItem; slug: string }) {
  const discounted = item.finalPrice < item.salePrice;
  return (
    <Link
      href={`/tienda/${slug}/prenda/${encodeURIComponent(item.code)}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--rt-line)] bg-[var(--rt-surface)] shadow-[var(--rt-shadow)] transition hover:-translate-y-0.5"
    >
      <div className="relative aspect-[3/4] bg-[var(--rt-bg)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- fotos servidas por la app (DEC-03) */}
        <img src={item.photoUrl} alt={itemTitle(item)} loading="lazy" className="h-full w-full object-cover" />
        {discounted && item.discountLabel && (
          <span className="absolute left-2 top-2 rounded-full bg-[var(--rt-royal)] px-2.5 py-1 text-xs font-bold text-white">{item.discountLabel}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-1 text-sm font-semibold">{itemTitle(item)}</p>
        <p className="line-clamp-1 text-xs text-[var(--rt-muted)]">{[item.size && `Talla ${item.size}`, item.color].filter(Boolean).join(" · ") || " "}</p>
        <p className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="text-base font-bold text-[var(--rt-navy)]">{formatMXN(item.finalPrice)}</span>
          {discounted && <span className="text-xs text-[var(--rt-muted)] line-through">{formatMXN(item.salePrice)}</span>}
        </p>
        <p className="text-xs font-medium text-[var(--rt-royal)]">{item.storeName}</p>
      </div>
    </Link>
  );
}
