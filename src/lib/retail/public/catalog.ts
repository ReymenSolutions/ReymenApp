// Reglas puras de la web pública de Retail (sin base de datos, probadas con vitest): qué se publica, filtros,
// precios y el mensaje de WhatsApp para apartar.
import type { PublicItem, PublicStore, PublishableCandidate, StoreFormat } from "./types";

/**
 * Qué prendas salen en la web (decisión W-01, opción A, 23 nov 2026): todo lo DISPONIBLE de canal TIENDA o EN_LINEA,
 * en una tienda activa, con foto. Lo de MAYOREO nunca sale suelto; la bodega nunca se publica.
 */
export function isPublishable(c: PublishableCandidate): boolean {
  return (
    c.status === "DISPONIBLE" &&
    (c.channel === "TIENDA" || c.channel === "EN_LINEA") &&
    c.storeIsActive &&
    c.storeType === "TIENDA" &&
    c.hasPhoto
  );
}

/** Qué vende cada formato, tal como lo confirmó el cliente (spec). Casa Carballo: no se afirman estufas. */
export const FORMAT_DESCRIPTION: Record<StoreFormat, string> = {
  PREMIUM: "Ropa premium: vestidos, camisas, tacones, tenis y joyería.",
  OUTLET: "Ropa casual y saldos.",
  HOGAR: "Hogar: colchas y electrodomésticos.",
};

export interface CatalogFilters {
  store?: string;
  category?: string;
  size?: string;
  color?: string;
  brand?: string;
  min?: number;
  max?: number;
  q?: string;
  sort: "recent" | "price_asc" | "price_desc";
}

const clean = (v: unknown, max = 60): string | undefined => {
  const s = (Array.isArray(v) ? v[0] : v)?.toString().trim();
  return s ? s.slice(0, max) : undefined;
};
const money = (v: unknown): number | undefined => {
  const s = clean(v, 12);
  if (!s) return undefined;
  const digits = s.replace(/[^\d.]/g, "");
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Filtros desde la URL (?tienda=&categoria=&talla=&color=&marca=&min=&max=&q=&orden=). Todo opcional y acotado. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): CatalogFilters {
  const sort = clean(sp.orden);
  return {
    store: clean(sp.tienda),
    category: clean(sp.categoria),
    size: clean(sp.talla, 20),
    color: clean(sp.color),
    brand: clean(sp.marca),
    min: money(sp.min),
    max: money(sp.max),
    q: clean(sp.q, 80),
    sort: sort === "precio_asc" ? "price_asc" : sort === "precio_desc" ? "price_desc" : "recent",
  };
}

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Aplica los filtros. El orden «recent» respeta el orden en que llegan (lo más nuevo primero, desde la consulta). */
export function applyFilters(items: PublicItem[], f: CatalogFilters): PublicItem[] {
  const eq = (a: string | null, b?: string) => !b || norm(a) === norm(b);
  const q = norm(f.q);
  const out = items.filter(
    (i) =>
      (!f.store || i.storeId === f.store) &&
      eq(i.category, f.category) &&
      eq(i.size, f.size) &&
      eq(i.color, f.color) &&
      eq(i.brand, f.brand) &&
      (f.min === undefined || i.finalPrice >= f.min) &&
      (f.max === undefined || i.finalPrice <= f.max) &&
      (!q || [i.brand, i.category, i.garmentType, i.style, i.color, i.code].some((v) => norm(v).includes(q))),
  );
  if (f.sort === "price_asc") out.sort((a, b) => a.finalPrice - b.finalPrice);
  if (f.sort === "price_desc") out.sort((a, b) => b.finalPrice - a.finalPrice);
  return out;
}

export interface Facets {
  categories: string[];
  sizes: string[];
  colors: string[];
  brands: string[];
}

/** Valores existentes para los filtros (solo de lo publicado), sin repetir y en orden alfabético. */
export function facets(items: PublicItem[]): Facets {
  const uniq = (vals: (string | null)[]) => {
    const seen = new Map<string, string>();
    for (const v of vals) if (v && v.trim() && !seen.has(norm(v))) seen.set(norm(v), v.trim());
    return [...seen.values()].sort((a, b) => a.localeCompare(b, "es"));
  };
  return {
    categories: uniq(items.map((i) => i.category)),
    sizes: uniq(items.map((i) => i.size)),
    colors: uniq(items.map((i) => i.color)),
    brands: uniq(items.map((i) => i.brand)),
  };
}

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
export function formatMXN(n: number): string {
  return MXN.format(n);
}

/** Número de WhatsApp para wa.me: 10 dígitos de México → 52 + número. Null si no es un número usable. */
export function waNumber(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 10) return `52${d}`;
  if (d.length === 12 && d.startsWith("52")) return d;
  if (d.length === 13 && d.startsWith("521")) return `52${d.slice(3)}`;
  return null;
}

export function itemTitle(i: Pick<PublicItem, "garmentType" | "category" | "brand">): string {
  const kind = i.garmentType || i.category || "Prenda";
  return i.brand ? `${kind} ${i.brand}` : kind;
}

/** Mensaje prellenado para confirmar el apartado por WhatsApp con la tienda. */
export function holdMessage(input: { item: PublicItem; customerName: string; expiresAt?: string | null; timeZone?: string }): string {
  const { item } = input;
  const details = [item.size && `Talla ${item.size}`, item.color, item.style].filter(Boolean).join(" · ");
  const lines = [
    `Hola ${item.storeName}, aparté esta prenda en la tienda en línea:`,
    "",
    `${itemTitle(item)}${details ? ` (${details})` : ""}`,
    `Código: ${item.code}`,
    `Precio: ${formatMXN(item.finalPrice)}`,
    "",
    `Mi nombre: ${input.customerName}`,
  ];
  if (input.expiresAt) {
    const when = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: input.timeZone || "America/Monterrey" }).format(new Date(input.expiresAt));
    lines.push(`Apartado hasta: ${when}`);
  }
  return lines.join("\n");
}

export function whatsappUrl(phone: string | null | undefined, text: string): string | null {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/** Tiendas que se muestran con catálogo (activas) y las que salen como «Próximamente». */
export function splitStores(stores: PublicStore[]): { active: PublicStore[]; comingSoon: PublicStore[] } {
  return { active: stores.filter((s) => s.isActive), comingSoon: stores.filter((s) => !s.isActive) };
}
