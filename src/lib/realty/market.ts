// Pure module — importable from client and server contexts.
//
// Market Pulse: "Demanda observada" con los datos internos de la empresa
// (prospectos activos e inventario propio). NO es un dato de mercado externo
// y no pretende serlo: todo sale de contar registros, sin IA.

import type { RealtyOperation, RealtyPropertyStatus, RealtyPropertyType } from "@prisma/client";
import { DEFAULT_BANDS, SUPPLY_STATUSES, bandFor, type BudgetBand } from "./constants";
import { fitsBudget } from "./match";

/** Prospecto activo, como lo necesita el análisis. */
export interface DemandProfile {
  id: string;
  operation: RealtyOperation;
  propertyType: RealtyPropertyType | null;
  minBudget: number | null;
  maxBudget: number;
  zoneIds: string[];
  preferences: string[];
  createdAt: Date;
}

export interface SupplyProperty {
  id: string;
  operation: RealtyOperation;
  propertyType: RealtyPropertyType;
  status: RealtyPropertyStatus;
  price: number;
  zoneId: string;
}

export interface ZoneRef {
  id: string;
  name: string;
}

/** Mínimo de registros para que una lectura (demanda alta, zona emergente…) cuente. */
export const MIN_SAMPLE = 3;

export type BalanceStatus = "HIGH_DEMAND" | "BALANCED" | "OVERSUPPLY" | "LOW_DATA";

/**
 * Lectura oferta/demanda de un segmento:
 *  - menos de MIN_SAMPLE registros entre ambos → datos insuficientes;
 *  - demanda ≥ MIN_SAMPLE y al menos el doble que la oferta → alta demanda;
 *  - oferta ≥ MIN_SAMPLE y al menos el doble que la demanda → sobreoferta;
 *  - lo demás, equilibrio.
 */
export function balanceStatus(demand: number, supply: number): BalanceStatus {
  if (demand + supply < MIN_SAMPLE) return "LOW_DATA";
  if (demand >= MIN_SAMPLE && demand >= supply * 2) return "HIGH_DEMAND";
  if (supply >= MIN_SAMPLE && supply >= demand * 2) return "OVERSUPPLY";
  return "BALANCED";
}

/** Prospectos por propiedad disponible (null si no hay oferta). */
export function demandRatio(demand: number, supply: number): number | null {
  if (supply === 0) return null;
  return Math.round((demand / supply) * 10) / 10;
}

export function isSupply(p: Pick<SupplyProperty, "status">): boolean {
  return SUPPLY_STATUSES.includes(p.status);
}

export interface ZoneBalance {
  zoneId: string;
  zoneName: string;
  demand: number;
  supply: number;
  ratio: number | null;
  status: BalanceStatus;
  /** Prospectos cuya 1.ª zona es esta. */
  primaryDemand: number;
}

/** Demanda y oferta por zona. Un prospecto cuenta en cada zona que eligió. */
export function zoneBalances(zones: ZoneRef[], profiles: DemandProfile[], properties: SupplyProperty[], operation?: RealtyOperation): ZoneBalance[] {
  const prof = operation ? profiles.filter((p) => p.operation === operation) : profiles;
  const supply = properties.filter((p) => isSupply(p) && (!operation || p.operation === operation));
  return zones
    .map((z) => {
      const demand = prof.filter((p) => p.zoneIds.includes(z.id)).length;
      const primaryDemand = prof.filter((p) => p.zoneIds[0] === z.id).length;
      const s = supply.filter((p) => p.zoneId === z.id).length;
      return { zoneId: z.id, zoneName: z.name, demand, supply: s, ratio: demandRatio(demand, s), status: balanceStatus(demand, s), primaryDemand };
    })
    // Cada colonia es una zona: las que no tienen ni demanda ni oferta no aportan nada al tablero.
    .filter((b) => b.demand > 0 || b.supply > 0)
    .sort((a, b) => b.demand - a.demand || a.zoneName.localeCompare(b.zoneName));
}

export interface BandBalance {
  band: BudgetBand;
  demand: number;
  supply: number;
  status: BalanceStatus;
}

/** Demanda por presupuesto máximo vs. oferta por precio, en los rangos de la operación. */
export function budgetBands(profiles: DemandProfile[], properties: SupplyProperty[], operation: RealtyOperation, bands: BudgetBand[] = DEFAULT_BANDS[operation]): BandBalance[] {
  const prof = profiles.filter((p) => p.operation === operation);
  const supply = properties.filter((p) => isSupply(p) && p.operation === operation);
  return bands.map((band) => {
    const demand = prof.filter((p) => bandFor(p.maxBudget, bands).key === band.key).length;
    const s = supply.filter((p) => bandFor(p.price, bands).key === band.key).length;
    return { band, demand, supply: s, status: balanceStatus(demand, s) };
  });
}

export interface OperationSplit {
  operation: RealtyOperation;
  demand: number;
  supply: number;
  demandPct: number;
}

/** Compra vs. renta. */
export function operationSplit(profiles: DemandProfile[], properties: SupplyProperty[]): OperationSplit[] {
  const total = profiles.length;
  return (["SALE", "RENT"] as RealtyOperation[]).map((operation) => {
    const demand = profiles.filter((p) => p.operation === operation).length;
    return {
      operation,
      demand,
      supply: properties.filter((p) => isSupply(p) && p.operation === operation).length,
      demandPct: total ? Math.round((demand / total) * 100) : 0,
    };
  });
}

export interface TypeBalance {
  propertyType: RealtyPropertyType;
  demand: number;
  supply: number;
  status: BalanceStatus;
}

/** Tipos de propiedad buscados vs. ofrecidos (los prospectos sin tipo no cuentan aquí). */
export function typeBalances(profiles: DemandProfile[], properties: SupplyProperty[], operation?: RealtyOperation): TypeBalance[] {
  const prof = operation ? profiles.filter((p) => p.operation === operation) : profiles;
  const supply = properties.filter((p) => isSupply(p) && (!operation || p.operation === operation));
  const types = new Set<RealtyPropertyType>([...prof.flatMap((p) => (p.propertyType ? [p.propertyType] : [])), ...supply.map((p) => p.propertyType)]);
  return [...types]
    .map((propertyType) => {
      const demand = prof.filter((p) => p.propertyType === propertyType).length;
      const s = supply.filter((p) => p.propertyType === propertyType).length;
      return { propertyType, demand, supply: s, status: balanceStatus(demand, s) };
    })
    .sort((a, b) => b.demand - a.demand);
}

/** Extras más pedidos (cuántos prospectos piden cada uno). */
export function topPreferences(profiles: DemandProfile[], limit = 6): { key: string; count: number; pct: number }[] {
  const counts = new Map<string, number>();
  for (const p of profiles) for (const k of new Set(p.preferences)) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, pct: profiles.length ? Math.round((count / profiles.length) * 100) : 0 }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export interface EmergingZone {
  zoneId: string;
  zoneName: string;
  current: number;
  previous: number;
  /** Crecimiento %; null si el periodo anterior fue 0. */
  growthPct: number | null;
}

/**
 * Zonas emergentes: nuevos prospectos que piden la zona en el periodo actual
 * contra el anterior (misma duración). Cuenta solo con muestra mínima
 * (≥ MIN_SAMPLE en el periodo actual) y crecimiento ≥ 50 % (o de 0 a ≥ MIN_SAMPLE).
 */
export function emergingZones(
  zones: ZoneRef[],
  profiles: DemandProfile[],
  period: { from: Date; to: Date },
  opts: { minSample?: number; minGrowthPct?: number } = {},
): EmergingZone[] {
  const minSample = opts.minSample ?? MIN_SAMPLE;
  const minGrowth = opts.minGrowthPct ?? 50;
  const len = period.to.getTime() - period.from.getTime();
  const prevFrom = new Date(period.from.getTime() - len);
  const inRange = (d: Date, a: Date, b: Date) => d >= a && d < b;
  const out: EmergingZone[] = [];
  for (const z of zones) {
    const asks = profiles.filter((p) => p.zoneIds.includes(z.id));
    const current = asks.filter((p) => inRange(p.createdAt, period.from, period.to)).length;
    const previous = asks.filter((p) => inRange(p.createdAt, prevFrom, period.from)).length;
    if (current < minSample) continue;
    const growthPct = previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
    if (growthPct === null || growthPct >= minGrowth) out.push({ zoneId: z.id, zoneName: z.name, current, previous, growthPct });
  }
  return out.sort((a, b) => (b.growthPct ?? Infinity) - (a.growthPct ?? Infinity) || b.current - a.current);
}

export interface SourcingOpportunity {
  zoneId: string;
  zoneName: string;
  operation: RealtyOperation;
  propertyType: RealtyPropertyType | null;
  band: BudgetBand;
  demand: number;
  supply: number;
}

/**
 * Captación: combinaciones zona × operación × tipo × rango de presupuesto
 * con demanda ≥ MIN_SAMPLE y donde la oferta disponible que les cabe en
 * presupuesto es a lo más un tercio de esa demanda. Dice qué salir a buscar.
 */
export function sourcingOpportunities(zones: ZoneRef[], profiles: DemandProfile[], properties: SupplyProperty[], limit = 8): SourcingOpportunity[] {
  const supply = properties.filter(isSupply);
  const groups = new Map<string, { zoneId: string; operation: RealtyOperation; propertyType: RealtyPropertyType | null; band: BudgetBand; profiles: DemandProfile[] }>();
  for (const p of profiles) {
    const band = bandFor(p.maxBudget, DEFAULT_BANDS[p.operation]);
    for (const zoneId of p.zoneIds.slice(0, 2)) {
      const key = `${zoneId}|${p.operation}|${p.propertyType ?? "*"}|${band.key}`;
      const g = groups.get(key) ?? { zoneId, operation: p.operation, propertyType: p.propertyType, band, profiles: [] };
      g.profiles.push(p);
      groups.set(key, g);
    }
  }
  const name = new Map(zones.map((z) => [z.id, z.name]));
  const out: SourcingOpportunity[] = [];
  for (const g of groups.values()) {
    if (g.profiles.length < MIN_SAMPLE) continue;
    const fitting = supply.filter(
      (s) =>
        s.zoneId === g.zoneId &&
        s.operation === g.operation &&
        (!g.propertyType || s.propertyType === g.propertyType) &&
        g.profiles.some((p) => fitsBudget(s.price, p.minBudget, p.maxBudget)),
    ).length;
    if (fitting * 3 > g.profiles.length) continue;
    out.push({ zoneId: g.zoneId, zoneName: name.get(g.zoneId) ?? "—", operation: g.operation, propertyType: g.propertyType, band: g.band, demand: g.profiles.length, supply: fitting });
  }
  return out.sort((a, b) => b.demand - b.supply - (a.demand - a.supply)).slice(0, limit);
}
