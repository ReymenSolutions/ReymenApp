// Pure module — importable from client and server contexts.
//
// Catálogos de REYMEN Ops Realty: tipos, estados, extras, rangos de
// presupuesto y utilidades de texto (claves de zona, slugs).

import type { RealtyOperation, RealtyPropertyStatus, RealtyPropertyType } from "@prisma/client";

export const OPERATIONS: RealtyOperation[] = ["SALE", "RENT"];
export const PROPERTY_TYPES: RealtyPropertyType[] = ["HOUSE", "APARTMENT", "LAND", "OFFICE", "COMMERCIAL", "WAREHOUSE", "OTHER"];
export const PROPERTY_STATUSES: RealtyPropertyStatus[] = ["AVAILABLE", "RESERVED", "NEGOTIATION", "SOLD", "RENTED", "INACTIVE"];

/** Estados que siguen siendo inventario ofrecible (vendidas, rentadas e inactivas no cuentan). */
export const OPEN_STATUSES: RealtyPropertyStatus[] = ["AVAILABLE", "RESERVED", "NEGOTIATION"];
/** Solo "disponible" cuenta como oferta para oferta/demanda y captación. */
export const SUPPLY_STATUSES: RealtyPropertyStatus[] = ["AVAILABLE"];
export const CLOSED_STATUSES: RealtyPropertyStatus[] = ["SOLD", "RENTED"];

export function isOpenStatus(s: RealtyPropertyStatus): boolean {
  return OPEN_STATUSES.includes(s);
}

/** Extras que un prospecto puede pedir y una propiedad puede tener (mismas claves de ambos lados). */
export const FEATURES = ["parking", "pet_friendly", "furnished", "terrace", "garden", "amenities", "pool", "security", "study", "storage"] as const;
export type Feature = (typeof FEATURES)[number];

export interface BudgetBand {
  key: string;
  min: number; // inclusivo
  max: number | null; // exclusivo; null = sin tope
}

/**
 * Rangos iniciales (MXN). La arquitectura recibe los rangos como parámetro
 * (bandsFor) para poder hacerlos configurables por empresa después.
 */
export const DEFAULT_BANDS: Record<RealtyOperation, BudgetBand[]> = {
  SALE: [
    { key: "lt2m", min: 0, max: 2_000_000 },
    { key: "2-4m", min: 2_000_000, max: 4_000_000 },
    { key: "4-6m", min: 4_000_000, max: 6_000_000 },
    { key: "6-10m", min: 6_000_000, max: 10_000_000 },
    { key: "gt10m", min: 10_000_000, max: null },
  ],
  RENT: [
    { key: "lt15k", min: 0, max: 15_000 },
    { key: "15-25k", min: 15_000, max: 25_000 },
    { key: "25-40k", min: 25_000, max: 40_000 },
    { key: "40-60k", min: 40_000, max: 60_000 },
    { key: "gt60k", min: 60_000, max: null },
  ],
};

export function bandFor(amount: number, bands: BudgetBand[]): BudgetBand {
  return bands.find((b) => amount >= b.min && (b.max === null || amount < b.max)) ?? bands[bands.length - 1];
}

/** Etiqueta corta de un rango: "$2M–$4M", "< $15k", "> $10M". */
export function bandLabel(b: BudgetBand): string {
  const fmt = (n: number) => (n >= 1_000_000 ? `$${trim(n / 1_000_000)}M` : `$${trim(n / 1_000)}k`);
  if (b.min === 0 && b.max !== null) return `< ${fmt(b.max)}`;
  if (b.max === null) return `> ${fmt(b.min)}`;
  return `${fmt(b.min)}–${fmt(b.max)}`;
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Clave de zona: minúsculas, sin acentos ni signos ("San Pedro" → "san-pedro"). */
export function zoneKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Slug público de una propiedad: título + sufijo aleatorio corto, para que sea único global. */
export function propertySlug(title: string, suffix: string): string {
  const base = zoneKey(title).slice(0, 50) || "propiedad";
  return `${base}-${suffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}`;
}

/** Días completos entre dos fechas (≥ 0). */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

export function clamp(n: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, n));
}
