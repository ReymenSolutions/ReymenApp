// Pure module — importable from client and server contexts.
//
// Rotación de inventario: cuánto tardan en venderse o rentarse las propiedades,
// qué segmentos se mueven y en qué se parecen las rápidas y las lentas.
// Todo sale de contar y comparar datos internos; ningún número viene de IA.

import type { RealtyOperation, RealtyPropertyType } from "@prisma/client";
import { MIN_SAMPLE } from "./market";
import { median } from "./scores";

export const FAST_DAYS = 30;
export const SLOW_DAYS = 90;
export const ROTATION_DISCLAIMER = "Lectura basada en datos internos de tu inmobiliaria.";

export type Speed = "FAST" | "NORMAL" | "SLOW";
export type SegmentStatus = "FAST" | "NORMAL" | "SLOW" | "LOW_DATA";

/** Propiedad ya vendida o rentada, con lo necesario para explicar su rotación. */
export interface ClosedProperty {
  id: string;
  title: string;
  operation: RealtyOperation;
  propertyType: RealtyPropertyType;
  zoneId: string;
  price: number;
  /** Desde cuándo estuvo ofrecida. */
  listedAt: Date;
  closedAt: Date;
  views: number;
  /** Interacciones de alto interés (WhatsApp, agendar, compartir). */
  interest: number;
  photos: number;
  bedrooms: number | null;
  /** Asesor de la propiedad (id) y origen del prospecto que la cerró (RealtyLeadProfile.source); null = sin dato. */
  advisorKey?: string | null;
  channelKey?: string | null;
}

/** Propiedad todavía en inventario (para sell-through y precio de referencia). */
export interface OpenProperty {
  operation: RealtyOperation;
  propertyType: RealtyPropertyType;
  zoneId: string;
  price: number;
  advisorKey?: string | null;
}

const DAY = 86_400_000;

export function daysOnMarket(listedAt: Date, closedAt: Date): number {
  return Math.max(0, Math.round((closedAt.getTime() - listedAt.getTime()) / DAY));
}

export function speedOf(days: number): Speed {
  if (days <= FAST_DAYS) return "FAST";
  if (days >= SLOW_DAYS) return "SLOW";
  return "NORMAL";
}

export interface RotationSummary {
  closed: number;
  open: number;
  medianDays: number | null;
  avgDays: number | null;
  fast: number;
  slow: number;
  /** cerradas / (cerradas + abiertas), 0–100. */
  sellThroughPct: number | null;
}

export function summarize(closed: ClosedProperty[], openCount: number): RotationSummary {
  const days = closed.map((c) => daysOnMarket(c.listedAt, c.closedAt));
  const total = closed.length + openCount;
  return {
    closed: closed.length,
    open: openCount,
    medianDays: median(days) === null ? null : Math.round(median(days)!),
    avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null,
    fast: days.filter((d) => speedOf(d) === "FAST").length,
    slow: days.filter((d) => speedOf(d) === "SLOW").length,
    sellThroughPct: total ? Math.round((closed.length / total) * 100) : null,
  };
}

export interface SegmentRow {
  key: string;
  closed: number;
  open: number;
  medianDays: number | null;
  sellThroughPct: number | null;
  status: SegmentStatus;
}

/** Rotación de un segmento: sin MIN_SAMPLE cierres no opina; ≤30 d rápida, ≥90 d lenta. */
export function segmentStatus(closedCount: number, medianDays: number | null): SegmentStatus {
  if (closedCount < MIN_SAMPLE || medianDays === null) return "LOW_DATA";
  return speedOf(medianDays);
}

/** Agrupa cerradas y abiertas por una clave (zona, tipo, rango de precio…). */
export function segmentRotation(
  closed: ClosedProperty[],
  open: OpenProperty[],
  closedKey: (c: ClosedProperty) => string,
  /** null = esa propiedad abierta no cuenta en esta agrupación (p. ej. el canal solo se conoce al cerrar). */
  openKey: (o: OpenProperty) => string | null,
): SegmentRow[] {
  const map = new Map<string, { days: number[]; open: number }>();
  const slot = (k: string) => {
    let s = map.get(k);
    if (!s) map.set(k, (s = { days: [], open: 0 }));
    return s;
  };
  for (const c of closed) slot(closedKey(c)).days.push(daysOnMarket(c.listedAt, c.closedAt));
  for (const o of open) {
    const k = openKey(o);
    if (k !== null) slot(k).open++;
  }
  return [...map.entries()]
    .map(([key, s]) => {
      const m = median(s.days);
      const medianDays = m === null ? null : Math.round(m);
      const total = s.days.length + s.open;
      return {
        key,
        closed: s.days.length,
        open: s.open,
        medianDays,
        sellThroughPct: total ? Math.round((s.days.length / total) * 100) : null,
        status: segmentStatus(s.days.length, medianDays),
      };
    })
    .sort((a, b) => b.closed - a.closed || (a.medianDays ?? Infinity) - (b.medianDays ?? Infinity));
}

export interface PropertyRotation {
  id: string;
  title: string;
  zoneId: string;
  operation: RealtyOperation;
  propertyType: RealtyPropertyType;
  days: number;
  speed: Speed;
  price: number;
  /** Precio ÷ mediana de propiedades comparables (misma operación y tipo); 1 = igual. */
  priceIndex: number | null;
  views: number;
  interest: number;
  photos: number;
  bedrooms: number | null;
}

/**
 * Precio relativo a la mediana de su operación + tipo (cerradas y abiertas),
 * solo si hay MIN_SAMPLE comparables; si no, null.
 */
export function priceIndexOf(c: { operation: RealtyOperation; propertyType: RealtyPropertyType; price: number }, pool: { operation: RealtyOperation; propertyType: RealtyPropertyType; price: number }[]): number | null {
  const prices = pool.filter((p) => p.operation === c.operation && p.propertyType === c.propertyType).map((p) => p.price);
  if (prices.length < MIN_SAMPLE) return null;
  const m = median(prices);
  return m && m > 0 ? Math.round((c.price / m) * 100) / 100 : null;
}

export function rotationOfProperties(closed: ClosedProperty[], open: OpenProperty[]): PropertyRotation[] {
  const pool = [...closed, ...open];
  return closed
    .map((c) => {
      const days = daysOnMarket(c.listedAt, c.closedAt);
      return {
        id: c.id,
        title: c.title,
        zoneId: c.zoneId,
        operation: c.operation,
        propertyType: c.propertyType,
        days,
        speed: speedOf(days),
        price: c.price,
        priceIndex: priceIndexOf(c, pool),
        views: c.views,
        interest: c.interest,
        photos: c.photos,
        bedrooms: c.bedrooms,
      };
    })
    .sort((a, b) => a.days - b.days);
}

export interface GroupProfile {
  count: number;
  medianPriceIndex: number | null;
  medianViews: number | null;
  medianInterest: number | null;
  medianPhotos: number | null;
}

export type InsightCode = "PRICE_LOWER" | "PRICE_HIGHER" | "MORE_INTEREST" | "LESS_INTEREST" | "MORE_PHOTOS" | "FEWER_PHOTOS";

export interface FastSlowComparison {
  fast: GroupProfile;
  slow: GroupProfile;
  /** Hallazgos con datos suficientes; vacío si no hay base para opinar. */
  insights: { code: InsightCode; fast: number; slow: number }[];
  enough: boolean;
}

function profileOf(rows: PropertyRotation[]): GroupProfile {
  const med = (xs: (number | null)[]) => {
    const m = median(xs.filter((x): x is number => x !== null));
    return m === null ? null : Math.round(m * 100) / 100;
  };
  return {
    count: rows.length,
    medianPriceIndex: med(rows.map((r) => r.priceIndex)),
    medianViews: med(rows.map((r) => r.views)),
    medianInterest: med(rows.map((r) => r.interest)),
    medianPhotos: med(rows.map((r) => r.photos)),
  };
}

/**
 * Compara las que se movieron rápido contra las lentas. Solo opina si hay
 * MIN_SAMPLE en cada grupo, y solo reporta diferencias que valen la pena
 * (precio ±5 puntos del índice, interés ±30 %, fotos ±2).
 */
export function compareFastSlow(rows: PropertyRotation[]): FastSlowComparison {
  const fast = profileOf(rows.filter((r) => r.speed === "FAST"));
  const slow = profileOf(rows.filter((r) => r.speed === "SLOW"));
  const enough = fast.count >= MIN_SAMPLE && slow.count >= MIN_SAMPLE;
  const insights: FastSlowComparison["insights"] = [];
  if (enough) {
    if (fast.medianPriceIndex !== null && slow.medianPriceIndex !== null) {
      const d = slow.medianPriceIndex - fast.medianPriceIndex;
      if (d >= 0.05) insights.push({ code: "PRICE_LOWER", fast: fast.medianPriceIndex, slow: slow.medianPriceIndex });
      else if (d <= -0.05) insights.push({ code: "PRICE_HIGHER", fast: fast.medianPriceIndex, slow: slow.medianPriceIndex });
    }
    if (fast.medianInterest !== null && slow.medianInterest !== null && (fast.medianInterest > 0 || slow.medianInterest > 0)) {
      const base = Math.max(slow.medianInterest, 1);
      const ratio = (fast.medianInterest - slow.medianInterest) / base;
      if (ratio >= 0.3) insights.push({ code: "MORE_INTEREST", fast: fast.medianInterest, slow: slow.medianInterest });
      else if (ratio <= -0.3) insights.push({ code: "LESS_INTEREST", fast: fast.medianInterest, slow: slow.medianInterest });
    }
    if (fast.medianPhotos !== null && slow.medianPhotos !== null) {
      const d = fast.medianPhotos - slow.medianPhotos;
      if (d >= 2) insights.push({ code: "MORE_PHOTOS", fast: fast.medianPhotos, slow: slow.medianPhotos });
      else if (d <= -2) insights.push({ code: "FEWER_PHOTOS", fast: fast.medianPhotos, slow: slow.medianPhotos });
    }
  }
  return { fast, slow, insights, enough };
}

export interface UnmetProfile {
  zoneIds: string[];
  maxBudget: number;
  operation: RealtyOperation;
  /** Mejor compatibilidad con el inventario (0–100); null si nunca se calculó. */
  bestScore: number | null;
}

export interface UnmetZone {
  zoneId: string;
  count: number;
  medianBudget: number | null;
}

/**
 * Demanda sin cubrir: prospectos activos cuya mejor propiedad no llega a
 * `threshold`, agrupados por zona pedida. Una zona solo aparece con MIN_SAMPLE.
 */
export function unmetDemandByZone(profiles: UnmetProfile[], threshold: number): UnmetZone[] {
  const byZone = new Map<string, number[]>();
  for (const p of profiles) {
    if ((p.bestScore ?? 0) >= threshold) continue;
    for (const z of p.zoneIds) {
      const arr = byZone.get(z) ?? [];
      arr.push(p.maxBudget);
      byZone.set(z, arr);
    }
  }
  return [...byZone.entries()]
    .filter(([, budgets]) => budgets.length >= MIN_SAMPLE)
    .map(([zoneId, budgets]) => ({ zoneId, count: budgets.length, medianBudget: median(budgets) }))
    .sort((a, b) => b.count - a.count);
}
