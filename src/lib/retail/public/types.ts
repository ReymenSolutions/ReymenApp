// Tipos de la web pública de ventas de Retail (/tienda/<slug>). Solo lo que el cliente final puede ver: nunca costo,
// márgenes, movimientos, ventas ni datos de otros clientes. Contrato con el núcleo del módulo: docs/retail/WEB-CONTRACT.md.

/** Formato de tienda (RetailLocationSettings.format, DEC-01). La bodega nunca se publica. */
export type StoreFormat = "PREMIUM" | "OUTLET" | "HOGAR";

export interface PublicStore {
  id: string;
  name: string;
  format: StoreFormat;
  /** Casa Carballo nace inactiva: se muestra como «Próximamente», sin catálogo. */
  isActive: boolean;
  /** WhatsApp de la tienda para apartar. TBD hasta que lo capture el negocio: sin él no se muestra el botón. */
  whatsappPhone: string | null;
}

export interface PublicItem {
  id: string;
  code: string;
  brand: string | null;
  category: string | null;
  garmentType: string | null;
  size: string | null;
  color: string | null;
  style: string | null;
  /** Precio publicado (MXN). */
  salePrice: number;
  /** Precio con el descuento aprobado y vigente para la web; igual a salePrice si no hay. */
  finalPrice: number;
  /** Nombre del plan de descuento aplicado (p. ej. «Plan A»), si hay. */
  discountLabel: string | null;
  storeId: string;
  storeName: string;
  photoUrl: string;
}

export interface Storefront {
  organizationId: string;
  orgName: string;
  slug: string;
  /** Tiendas tipo TIENDA (activas e inactivas), en orden. */
  stores: PublicStore[];
  /** Solo prendas publicables (ver isPublishable). */
  items: PublicItem[];
}

/** Lo mínimo del núcleo para decidir si una prenda sale en la web. */
export interface PublishableCandidate {
  status: string;
  channel: string;
  storeIsActive: boolean;
  storeType: string;
  hasPhoto: boolean;
}

export type HoldResult =
  | { ok: true; itemCode: string; expiresAt: string; whatsappUrl: string | null }
  | { ok: false; reason: "NOT_AVAILABLE" | "NOT_READY" | "RATE_LIMITED" | "INVALID" };
