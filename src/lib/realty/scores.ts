// Pure module — importable from client and server contexts.
//
// Opportunity Score de propiedades y de zonas, propiedades a impulsar,
// estancadas y Price Insight. Todo con reglas y conteos de datos internos;
// ningún número sale de IA. Cada score trae su desglose para explicarlo.

import type { RealtyOperation, RealtyPropertyStatus, RealtyPropertyType } from "@prisma/client";
import { OPEN_STATUSES, clamp, daysBetween } from "./constants";
import { fitsBudget } from "./match";
import { MIN_SAMPLE, isSupply, type DemandProfile, type ZoneRef } from "./market";

export const PRICE_INSIGHT_DISCLAIMER = "Insight basado en datos internos.";

export const PROPERTY_SCORE_WEIGHTS = { zoneDemand: 30, priceFit: 25, engagement: 20, freshness: 15, competition: 10 } as const;
export const ZONE_SCORE_WEIGHTS = { pressure: 40, growth: 25, engagement: 20, unmet: 15 } as const;

/** Interacciones de la landing pública en una ventana (normalmente 30 días). */
export interface Engagement {
  views: number;
  whatsapp: number;
  schedule: number;
  share: number;
}

export const EMPTY_ENGAGEMENT: Engagement = { views: 0, whatsapp: 0, schedule: 0, share: 0 };

/** Puntos de interés: una vista vale 1, compartir 2, WhatsApp 4 y agendar 5. */
export function engagementPoints(e: Engagement | undefined): number {
  if (!e) return 0;
  return e.views + e.share * 2 + e.whatsapp * 4 + e.schedule * 5;
}

export interface ScoredProperty {
  id: string;
  operation: RealtyOperation;
  propertyType: RealtyPropertyType;
  status: RealtyPropertyStatus;
  price: number;
  zoneId: string;
  constructionArea: number | null;
  landArea: number | null;
  /** Desde cuándo está en inventario (availableSince ?? createdAt). */
  listedAt: Date;
}

export interface PropertyScore {
  propertyId: string;
  total: number;
  zoneDemand: number;
  priceFit: number;
  engagement: number;
  freshness: number;
  competition: number;
  /** Datos crudos detrás del score (para la explicación). */
  facts: { demand: number; supply: number; fitting: number; points: number; days: number; competitors: number };
}

/** Prospectos de la misma operación que piden esa zona. */
function zoneDemandOf(profiles: DemandProfile[], operation: RealtyOperation, zoneId: string): DemandProfile[] {
  return profiles.filter((p) => p.operation === operation && p.zoneIds.includes(zoneId));
}

/** Días en inventario → frescura: hasta 30 días 100, baja lineal a 0 a los 180. */
export function freshnessScore(days: number): number {
  if (days <= 30) return 100;
  if (days >= 180) return 0;
  return Math.round(100 - ((days - 30) / 150) * 100);
}

/** Competencia: propiedades disponibles iguales (zona, operación, tipo) a ±20 % del precio; −25 por cada una. */
export function competitorsOf(p: ScoredProperty, all: ScoredProperty[]): number {
  return all.filter(
    (o) =>
      o.id !== p.id &&
      isSupply(o) &&
      o.zoneId === p.zoneId &&
      o.operation === p.operation &&
      o.propertyType === p.propertyType &&
      Math.abs(o.price - p.price) <= p.price * 0.2,
  ).length;
}

export function propertyOpportunity(
  p: ScoredProperty,
  ctx: { profiles: DemandProfile[]; properties: ScoredProperty[]; engagement: Map<string, Engagement>; now: Date },
): PropertyScore {
  const demandList = zoneDemandOf(ctx.profiles, p.operation, p.zoneId);
  const demand = demandList.length;
  const supply = ctx.properties.filter((o) => isSupply(o) && o.operation === p.operation && o.zoneId === p.zoneId).length;
  // 2 o más prospectos por propiedad disponible = presión máxima.
  const zoneDemand = demand === 0 ? 0 : Math.round(clamp((demand / Math.max(1, supply) / 2) * 100));
  const fitting = demandList.filter((d) => fitsBudget(p.price, d.minBudget, d.maxBudget)).length;
  const priceFit = demand === 0 ? 0 : Math.round((fitting / demand) * 100);
  const points = engagementPoints(ctx.engagement.get(p.id));
  const maxPoints = Math.max(10, ...ctx.properties.filter((o) => OPEN_STATUSES.includes(o.status)).map((o) => engagementPoints(ctx.engagement.get(o.id))));
  const engagement = Math.round(clamp((points / maxPoints) * 100));
  const days = daysBetween(p.listedAt, ctx.now);
  const freshness = freshnessScore(days);
  const competitors = competitorsOf(p, ctx.properties);
  const competition = clamp(100 - competitors * 25);
  const w = PROPERTY_SCORE_WEIGHTS;
  const total = Math.round(
    (zoneDemand * w.zoneDemand + priceFit * w.priceFit + engagement * w.engagement + freshness * w.freshness + competition * w.competition) / 100,
  );
  return { propertyId: p.id, total, zoneDemand, priceFit, engagement, freshness, competition, facts: { demand, supply, fitting, points, days, competitors } };
}

/** Umbral para "impulsar": score alto, la zona sí tiene demanda y a buena parte de ella le cabe el precio. */
export const BOOST_MIN_SCORE = 65;

export function isBoostCandidate(p: ScoredProperty, s: PropertyScore): boolean {
  return isSupply(p) && s.total >= BOOST_MIN_SCORE && s.zoneDemand >= 50 && s.priceFit >= 30;
}

/**
 * Estancada: abierta y con ≥ 60 días en inventario, más una de estas señales
 * (en los últimos 30 días). Son señales, no causas: la UI sugiere qué revisar.
 *  - LOW_VIEWS: menos de 15 puntos de interés y sin visitas;
 *  - LOW_CONTACT: ≥ 30 vistas pero menos del 2 % escribe o agenda;
 *  - NO_VISITS: ≥ 5 contactos (WhatsApp/agendar) y ninguna visita;
 *  - NO_NEGOTIATION: ≥ 3 visitas y sigue disponible (nadie negocia).
 */
export const STAGNANT_DAYS = 60;
export const STAGNANT_MAX_POINTS = 15;

export type StagnationReason = "LOW_VIEWS" | "LOW_CONTACT" | "NO_VISITS" | "NO_NEGOTIATION";

export function stagnationReason(p: ScoredProperty, s: PropertyScore, recentVisits: number, e?: Engagement): StagnationReason | null {
  if (!OPEN_STATUSES.includes(p.status) || s.facts.days < STAGNANT_DAYS) return null;
  const views = e?.views ?? 0;
  const contacts = (e?.whatsapp ?? 0) + (e?.schedule ?? 0);
  if (s.facts.points < STAGNANT_MAX_POINTS && recentVisits === 0) return "LOW_VIEWS";
  if (views >= 30 && contacts / views < 0.02) return "LOW_CONTACT";
  if (contacts >= 5 && recentVisits === 0) return "NO_VISITS";
  if (recentVisits >= 3 && p.status === "AVAILABLE") return "NO_NEGOTIATION";
  return null;
}

export function isStagnant(p: ScoredProperty, s: PropertyScore, recentVisits: number, e?: Engagement): boolean {
  return stagnationReason(p, s, recentVisits, e) !== null;
}

export type PricePosition = "ABOVE" | "IN_RANGE" | "BELOW" | "INSUFFICIENT";

export interface PriceInsight {
  position: PricePosition;
  /** "m2" si se comparó precio por m²; "price" si fue precio total. */
  basis: "m2" | "price";
  /** Mediana de los comparables (en la base elegida). */
  median: number | null;
  subject: number;
  diffPct: number | null;
  sample: number;
  /** % de la demanda de esa zona/operación a la que le cabe el precio. */
  budgetFitPct: number | null;
  disclaimer: string;
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function areaOf(p: ScoredProperty): number | null {
  const a = p.propertyType === "LAND" ? p.landArea : (p.constructionArea ?? p.landArea);
  return a && a > 0 ? a : null;
}

/**
 * Price Insight: compara contra propiedades propias de la misma zona,
 * operación y tipo (cualquier estado menos inactiva, incluidas vendidas o
 * rentadas). Usa precio por m² cuando hay área suficiente; si no, precio.
 * Con menos de MIN_SAMPLE comparables no opina. ±10 % es "en rango".
 * No es un avalúo: es una lectura de los datos internos.
 */
export function priceInsight(p: ScoredProperty, all: ScoredProperty[], profiles: DemandProfile[]): PriceInsight {
  const comps = all.filter((o) => o.id !== p.id && o.status !== "INACTIVE" && o.zoneId === p.zoneId && o.operation === p.operation && o.propertyType === p.propertyType);
  const subjectArea = areaOf(p);
  const withArea = comps.filter((o) => areaOf(o) !== null);
  const useM2 = subjectArea !== null && withArea.length >= MIN_SAMPLE;
  const basis = useM2 ? "m2" : "price";
  const values = useM2 ? withArea.map((o) => o.price / (areaOf(o) as number)) : comps.map((o) => o.price);
  const subject = useM2 ? p.price / (subjectArea as number) : p.price;
  const demand = zoneDemandOf(profiles, p.operation, p.zoneId);
  const budgetFitPct = demand.length ? Math.round((demand.filter((d) => fitsBudget(p.price, d.minBudget, d.maxBudget)).length / demand.length) * 100) : null;
  const base = { basis, subject: Math.round(subject), sample: values.length, budgetFitPct, disclaimer: PRICE_INSIGHT_DISCLAIMER } as const;
  if (values.length < MIN_SAMPLE) return { ...base, position: "INSUFFICIENT", median: null, diffPct: null };
  const med = median(values) as number;
  const diffPct = Math.round(((subject - med) / med) * 100);
  const position: PricePosition = diffPct > 10 ? "ABOVE" : diffPct < -10 ? "BELOW" : "IN_RANGE";
  return { ...base, position, median: Math.round(med), diffPct };
}

export interface ZoneScore {
  zoneId: string;
  zoneName: string;
  total: number;
  pressure: number;
  growth: number;
  engagement: number;
  unmet: number;
  facts: { demand: number; supply: number; newDemand: number; prevDemand: number; points: number; unmetProfiles: number };
}

/**
 * Opportunity Score por zona:
 *  presión de demanda 40 (prospectos por propiedad disponible, 2+ = 100) ·
 *  crecimiento 25 (nuevos prospectos vs. periodo anterior, con muestra mínima) ·
 *  interés en la landing 20 (relativo a la zona con más) ·
 *  demanda sin atender 15 (% de prospectos sin ninguna propiedad disponible que les quepa).
 */
export function zoneOpportunity(
  zones: ZoneRef[],
  ctx: { profiles: DemandProfile[]; properties: ScoredProperty[]; engagement: Map<string, Engagement>; period: { from: Date; to: Date } },
): ZoneScore[] {
  const len = ctx.period.to.getTime() - ctx.period.from.getTime();
  const prevFrom = new Date(ctx.period.from.getTime() - len);
  const zonePoints = new Map<string, number>();
  for (const p of ctx.properties) zonePoints.set(p.zoneId, (zonePoints.get(p.zoneId) ?? 0) + engagementPoints(ctx.engagement.get(p.id)));
  const maxPoints = Math.max(10, ...zonePoints.values());
  const supplyAll = ctx.properties.filter(isSupply);
  return zones
    .map((z) => {
      const prof = ctx.profiles.filter((p) => p.zoneIds.includes(z.id));
      const supply = supplyAll.filter((p) => p.zoneId === z.id);
      const demand = prof.length;
      const pressure = demand === 0 ? 0 : Math.round(clamp((demand / Math.max(1, supply.length) / 2) * 100));
      const newDemand = prof.filter((p) => p.createdAt >= ctx.period.from && p.createdAt < ctx.period.to).length;
      const prevDemand = prof.filter((p) => p.createdAt >= prevFrom && p.createdAt < ctx.period.from).length;
      const growth =
        newDemand < MIN_SAMPLE ? 0 : prevDemand === 0 ? 100 : Math.round(clamp(((newDemand - prevDemand) / prevDemand) * 100));
      const points = zonePoints.get(z.id) ?? 0;
      const engagement = Math.round(clamp((points / maxPoints) * 100));
      const unmetProfiles = prof.filter(
        (d) => !supply.some((s) => s.operation === d.operation && (!d.propertyType || s.propertyType === d.propertyType) && fitsBudget(s.price, d.minBudget, d.maxBudget)),
      ).length;
      const unmet = demand === 0 ? 0 : Math.round((unmetProfiles / demand) * 100);
      const w = ZONE_SCORE_WEIGHTS;
      const total = Math.round((pressure * w.pressure + growth * w.growth + engagement * w.engagement + unmet * w.unmet) / 100);
      return { zoneId: z.id, zoneName: z.name, total, pressure, growth, engagement, unmet, facts: { demand, supply: supply.length, newDemand, prevDemand, points, unmetProfiles } };
    })
    .sort((a, b) => b.total - a.total);
}
