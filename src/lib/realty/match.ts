// Pure module — importable from client and server contexts.
//
// Match prospecto ↔ propiedad, 0–100, explicable y sin IA. Cada componente
// da 0–100 y se pondera:
//   presupuesto 30 · zona 25 · tipo 15 · recámaras/baños 15 · superficie 10 · extras 5
// Si la operación no coincide (busca renta, la propiedad es venta) no hay
// match: total 0 y `eligible: false`. Si zona, tipo o presupuesto dan 0, el
// total se topa en 60 (MISS_CAP): puede servir de alternativa, no de match bueno.

import type { RealtyOperation, RealtyPropertyType } from "@prisma/client";
import { clamp } from "./constants";

export const MATCH_VERSION = "v1";

export const MATCH_WEIGHTS = { budget: 30, zone: 25, type: 15, rooms: 15, area: 10, extras: 5 } as const;
/** Tope del total cuando zona, tipo o presupuesto dan 0 (queda abajo de GOOD_MATCH). */
export const MISS_CAP = 60;

/** Lo que el prospecto busca (solo lo que usa el match). */
export interface MatchProfile {
  operation: RealtyOperation;
  propertyType: RealtyPropertyType | null;
  minBudget: number | null;
  maxBudget: number;
  /** Zonas por prioridad: la primera es la que más le interesa. */
  zoneIds: string[];
  minBedrooms: number | null;
  minBathrooms: number | null;
  minArea: number | null;
  preferences: string[];
}

export interface MatchProperty {
  operation: RealtyOperation;
  propertyType: RealtyPropertyType;
  price: number;
  zoneId: string;
  bedrooms: number | null;
  bathrooms: number | null;
  constructionArea: number | null;
  landArea: number | null;
  features: string[];
}

export interface MatchBreakdown {
  eligible: boolean;
  total: number;
  budget: number;
  zone: number;
  type: number;
  rooms: number;
  area: number;
  extras: number;
}

/**
 * Presupuesto (degradación definida):
 *  - precio dentro de [mín, máx] → 100;
 *  - arriba del máximo → baja lineal hasta 0 cuando lo excede en 20 %;
 *  - abajo del mínimo (busca algo de otro nivel) → baja lineal hasta 50 cuando
 *    queda 40 % por debajo; nunca menos de 50 (un precio menor no es un no).
 */
export function budgetScore(price: number, minBudget: number | null, maxBudget: number): number {
  if (!(maxBudget > 0) || !(price > 0)) return 0;
  if (price > maxBudget) {
    const over = (price - maxBudget) / maxBudget;
    return Math.round(clamp(100 * (1 - over / 0.2)));
  }
  if (minBudget && price < minBudget) {
    const under = (minBudget - price) / minBudget;
    return Math.round(clamp(100 - (50 * under) / 0.4, 50, 100));
  }
  return 100;
}

/** Zona: 1.ª prioridad 100, 2.ª 85, 3.ª o más 70; fuera de sus zonas 0; si no eligió zonas, 60 (neutral). */
export function zoneScore(zoneId: string, zoneIds: string[]): number {
  if (zoneIds.length === 0) return 60;
  const i = zoneIds.indexOf(zoneId);
  if (i === -1) return 0;
  return i === 0 ? 100 : i === 1 ? 85 : 70;
}

/** Tipos cercanos (casa ↔ depa, oficina ↔ local) valen 40; si no eligió tipo, 70. */
const NEAR_TYPES: [RealtyPropertyType, RealtyPropertyType][] = [
  ["HOUSE", "APARTMENT"],
  ["OFFICE", "COMMERCIAL"],
  ["COMMERCIAL", "WAREHOUSE"],
];

export function typeScore(propertyType: RealtyPropertyType, wanted: RealtyPropertyType | null): number {
  if (!wanted) return 70;
  if (wanted === propertyType) return 100;
  const near = NEAR_TYPES.some(([a, b]) => (a === wanted && b === propertyType) || (b === wanted && a === propertyType));
  return near ? 40 : 0;
}

/** Recámaras y baños: cada uno 100 si cumple; −50 por cada unidad que falte; promedio de los que pidió. */
export function roomsScore(p: Pick<MatchProperty, "bedrooms" | "bathrooms">, minBedrooms: number | null, minBathrooms: number | null): number {
  const part = (have: number | null, want: number | null): number | null => {
    if (!want) return null;
    if (have === null) return 50; // sin dato: ni premio ni castigo total
    return clamp(100 - Math.max(0, want - have) * 50);
  };
  const parts = [part(p.bedrooms, minBedrooms), part(p.bathrooms, minBathrooms)].filter((x): x is number => x !== null);
  if (parts.length === 0) return 100;
  return Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
}

/** Superficie: 100 si alcanza el mínimo; si no, proporcional, y 0 si tiene menos del 60 %. */
export function areaScore(p: Pick<MatchProperty, "constructionArea" | "landArea" | "propertyType">, minArea: number | null): number {
  if (!minArea) return 100;
  const have = p.propertyType === "LAND" ? p.landArea : (p.constructionArea ?? p.landArea);
  if (!have) return 50;
  if (have >= minArea) return 100;
  const ratio = have / minArea;
  if (ratio < 0.6) return 0;
  return Math.round(((ratio - 0.6) / 0.4) * 100);
}

/** Extras: % de los extras pedidos que la propiedad tiene (sin pedir, 100). */
export function extrasScore(features: string[], preferences: string[]): number {
  if (preferences.length === 0) return 100;
  const have = preferences.filter((p) => features.includes(p)).length;
  return Math.round((have / preferences.length) * 100);
}

export function computeMatch(profile: MatchProfile, property: MatchProperty): MatchBreakdown {
  if (profile.operation !== property.operation) {
    return { eligible: false, total: 0, budget: 0, zone: 0, type: 0, rooms: 0, area: 0, extras: 0 };
  }
  const parts = {
    budget: budgetScore(property.price, profile.minBudget, profile.maxBudget),
    zone: zoneScore(property.zoneId, profile.zoneIds),
    type: typeScore(property.propertyType, profile.propertyType),
    rooms: roomsScore(property, profile.minBedrooms, profile.minBathrooms),
    area: areaScore(property, profile.minArea),
    extras: extrasScore(property.features, profile.preferences),
  };
  const total =
    (parts.budget * MATCH_WEIGHTS.budget +
      parts.zone * MATCH_WEIGHTS.zone +
      parts.type * MATCH_WEIGHTS.type +
      parts.rooms * MATCH_WEIGHTS.rooms +
      parts.area * MATCH_WEIGHTS.area +
      parts.extras * MATCH_WEIGHTS.extras) /
    100;
  // Un "no" claro (fuera de sus zonas, otro tipo o precio > 20 % arriba de su máximo) no puede verse como buen match.
  const hardMiss = parts.zone === 0 || parts.type === 0 || parts.budget === 0;
  return { eligible: true, total: hardMiss ? Math.min(MISS_CAP, Math.round(total)) : Math.round(total), ...parts };
}

/** Umbrales de lectura en la UI. */
export const HIGH_MATCH = 80;
export const GOOD_MATCH = 65;

/** ¿El precio cae en lo que el prospecto puede pagar? (lo usan oferta/demanda y captación). */
export function fitsBudget(price: number, minBudget: number | null, maxBudget: number): boolean {
  return price <= maxBudget && (!minBudget || price >= minBudget * 0.7);
}
