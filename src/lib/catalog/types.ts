// Pure module. Catálogo de "productos" que un módulo ofrece para mostrar
// fuera de él (hoy: en el perfil público de una SmartCard). Cada módulo
// registra una fuente (ver index.ts); el que lo muestra no sabe de dónde
// viene cada producto, solo usa esta forma.

import type { PlatformModule } from "@prisma/client";

/** "<fuente>:<id>" — p. ej. "realty:ckx…". Identifica el producto para siempre. */
export type CatalogRef = string;

export interface CatalogItem {
  ref: CatalogRef;
  title: string;
  /** Una línea corta: "Casa · 3 rec · Cumbres". */
  subtitle: string | null;
  /** Precio ya formateado: "$4,500,000", "$18,000 / mes". */
  priceLabel: string | null;
  /** URL pública y absoluta (https) de la foto principal. */
  imageUrl: string | null;
  /** Página pública del producto (absoluta). */
  url: string;
  /** false = ya no se debe mostrar (vendida, rentada, despublicada…). */
  available: boolean;
}

export interface CatalogSource {
  /** Prefijo del ref; estable, nunca cambia. */
  key: string;
  module: PlatformModule;
  label: { es: string; en: string };
  /** Productos que se pueden agregar hoy (solo disponibles y públicos). */
  list(organizationId: string, query?: string): Promise<CatalogItem[]>;
  /** Un producto por id, esté o no disponible; null si no existe en la organización. */
  get(organizationId: string, id: string): Promise<CatalogItem | null>;
}

export function parseRef(ref: string): { key: string; id: string } | null {
  const i = ref.indexOf(":");
  if (i <= 0 || i === ref.length - 1) return null;
  return { key: ref.slice(0, i), id: ref.slice(i + 1) };
}
