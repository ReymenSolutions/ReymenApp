// Pure module — importable from client and server contexts.
//
// Métricas comerciales de REYMEN Loyalty: agregación por código postal,
// participación, ticket promedio, frecuencia, actividad, segmentos, zonas
// fuertes / de oportunidad e insights. Todo con reglas simples y
// transparentes (no hay modelos predictivos ni "IA"): cada insight dice de
// qué número sale. Las consultas (queries.ts) solo traen datos ya agregados
// o columnas compactas; los cálculos viven aquí para poder probarlos.

import { averageTicket, progressOf, roundMoney } from "./cycle";
import { zoneDistanceKm } from "./postal-zones";

// ─── Porcentajes que suman exactamente 100 ─────────────────────────────

/**
 * Porcentajes con `decimals` decimales que suman exactamente 100 (método del
 * mayor residuo), para que la participación por CP siempre cuadre en pantalla.
 * Si el total es 0, todo es 0.
 */
export function sharesPct(values: number[], decimals = 1): number[] {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 0) return values.map(() => 0);
  const unit = 10 ** decimals;
  const exact = values.map((v) => (Math.max(0, v) / total) * 100 * unit);
  const floors = exact.map(Math.floor);
  let left = 100 * unit - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rem: e - Math.floor(e) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors.map((f) => f / unit);
}

export function pctOf(part: number, whole: number, decimals = 1): number | null {
  if (!whole || whole <= 0) return null;
  const unit = 10 ** decimals;
  return Math.round((part / whole) * 100 * unit) / unit;
}

// ─── Zonas (código postal) ─────────────────────────────────────────────

/** Fila agregada por CP tal como sale de la consulta. */
export interface ZoneRow {
  postalCode: string;
  members: number;
  visits: number;
  visitsWithAmount: number;
  sales: number;
  /** Visitas del periodo anterior de la misma duración (para tendencia de frecuencia). */
  prevVisits?: number;
}

export type ZoneLabel = "strong" | "opportunity" | "high_value" | "low_frequency";

export interface ZoneStats extends ZoneRow {
  memberShare: number;
  salesShare: number;
  avgTicket: number;
  /** Visitas por cliente inscrito en el CP (visitas ÷ clientes). */
  frequency: number;
  /** Venta por cliente inscrito. */
  salesPerMember: number;
  distanceKm: number | null;
  labels: ZoneLabel[];
}

export interface ZoneSummary {
  zones: ZoneStats[];
  totals: { members: number; visits: number; visitsWithAmount: number; sales: number; avgTicket: number; frequency: number; salesPerMember: number };
}

/** Radio (km) en el que una zona se considera "cercana" a la sucursal. */
export const NEARBY_KM = 2.5;

/**
 * Reglas de etiquetas (todas relativas al promedio del propio negocio):
 *  - strong: % de clientes y % de ventas por arriba del promedio por zona,
 *    frecuencia ≥ la general y ticket ≥ 90% del general.
 *  - high_value: venta por cliente ≥ 1.3× la general con % de clientes por
 *    debajo del promedio (pocos clientes que valen mucho).
 *  - low_frequency: % de clientes por arriba del promedio pero frecuencia
 *    < 75% de la general (muchos clientes que regresan poco).
 *  - opportunity: zona cercana (≤ NEARBY_KM) con % de clientes menor a la
 *    mitad del promedio de las zonas cercanas (baja penetración).
 */
export function summarizeZones(rows: ZoneRow[]): ZoneSummary {
  const clean = rows.filter((r) => r.members > 0 || r.visits > 0);
  const memberShares = sharesPct(clean.map((r) => r.members));
  const salesShares = sharesPct(clean.map((r) => r.sales));

  const totals = clean.reduce(
    (t, r) => ({
      members: t.members + r.members,
      visits: t.visits + r.visits,
      visitsWithAmount: t.visitsWithAmount + r.visitsWithAmount,
      sales: roundMoney(t.sales + r.sales),
    }),
    { members: 0, visits: 0, visitsWithAmount: 0, sales: 0 }
  );
  const overall = {
    ...totals,
    avgTicket: averageTicket(totals.sales, totals.visitsWithAmount),
    frequency: totals.members > 0 ? round2(totals.visits / totals.members) : 0,
    salesPerMember: totals.members > 0 ? roundMoney(totals.sales / totals.members) : 0,
  };

  const zones: ZoneStats[] = clean.map((r, i) => ({
    ...r,
    sales: roundMoney(r.sales),
    memberShare: memberShares[i],
    salesShare: salesShares[i],
    avgTicket: averageTicket(r.sales, r.visitsWithAmount),
    frequency: r.members > 0 ? round2(r.visits / r.members) : 0,
    salesPerMember: r.members > 0 ? roundMoney(r.sales / r.members) : 0,
    distanceKm: zoneDistanceKm(r.postalCode),
    labels: [],
  }));

  if (zones.length > 0) {
    const avgShare = 100 / zones.length;
    const nearby = zones.filter((z) => z.distanceKm !== null && z.distanceKm <= NEARBY_KM);
    const nearbyAvgShare = nearby.length > 0 ? nearby.reduce((a, z) => a + z.memberShare, 0) / nearby.length : 0;
    for (const z of zones) {
      if (z.memberShare >= avgShare && z.salesShare >= avgShare && z.frequency >= overall.frequency && z.avgTicket >= overall.avgTicket * 0.9) {
        z.labels.push("strong");
      }
      if (overall.salesPerMember > 0 && z.salesPerMember >= overall.salesPerMember * 1.3 && z.memberShare < avgShare) {
        z.labels.push("high_value");
      }
      if (z.memberShare >= avgShare && overall.frequency > 0 && z.frequency < overall.frequency * 0.75) {
        z.labels.push("low_frequency");
      }
      if (z.distanceKm !== null && z.distanceKm <= NEARBY_KM && nearby.length >= 2 && z.memberShare < nearbyAvgShare / 2) {
        z.labels.push("opportunity");
      }
    }
  }

  zones.sort((a, b) => b.sales - a.sales || b.members - a.members || a.postalCode.localeCompare(b.postalCode));
  return { zones, totals: overall };
}

// ─── Clientes: actividad, progreso y segmentos ─────────────────────────

export const ACTIVE_DAYS = 30;
export const AT_RISK_DAYS = 60;
/** Ticket "alto": al menos este múltiplo del ticket promedio del programa. */
export const HIGH_TICKET_FACTOR = 1.3;
/** Cliente frecuente: al menos tantas visitas en total y activo. */
export const FREQUENT_MIN_VISITS = 6;

export type ActivityStatus = "active" | "at_risk" | "inactive";

const DAY_MS = 86_400_000;

/**
 * Activo: visitó en los últimos 30 días. En riesgo: 31–60. Inactivo: más de 60.
 * Un cliente que nunca ha visitado se mide desde su fecha de alta.
 */
export function activityStatus(lastVisitAt: Date | null, createdAt: Date, now: Date = new Date()): ActivityStatus {
  const ref = lastVisitAt ?? createdAt;
  const days = Math.floor((now.getTime() - ref.getTime()) / DAY_MS);
  if (days <= ACTIVE_DAYS) return "active";
  if (days <= AT_RISK_DAYS) return "at_risk";
  return "inactive";
}

/**
 * Fronteras de actividad como instantes, para filtrar en la base con la misma
 * regla que activityStatus(): activo si la referencia es posterior a
 * `activeAfter`, en riesgo si es posterior a `riskAfter`, inactivo si no.
 */
export function activityCutoffs(now: Date = new Date()): { activeAfter: Date; riskAfter: Date } {
  return {
    activeAfter: new Date(now.getTime() - (ACTIVE_DAYS + 1) * DAY_MS),
    riskAfter: new Date(now.getTime() - (AT_RISK_DAYS + 1) * DAY_MS),
  };
}

export function daysSince(date: Date | null, now: Date = new Date()): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

/** Columnas compactas de un miembro, suficientes para segmentar sin traer su historial. */
export interface MemberLite {
  id: string;
  postalCode: string;
  cycleVisits: number;
  totalVisits: number;
  visitsWithAmount: number;
  totalSpent: number;
  lastVisitAt: Date | null;
  createdAt: Date;
  availableRewards: number;
}

export type SegmentKey = "new" | "frequent" | "inactive" | "one_away" | "reward_available" | "high_ticket" | "at_risk";

export interface SegmentCounts {
  total: number;
  active: number;
  atRisk: number;
  inactive: number;
  segments: Record<SegmentKey, number>;
}

/** El miembro pertenece al segmento. `newSince`: fecha desde la que un alta cuenta como "nuevo". */
export function inSegment(m: MemberLite, key: SegmentKey, ctx: { goal: number; programAvgTicket: number; newSince: Date; now: Date }): boolean {
  const status = activityStatus(m.lastVisitAt, m.createdAt, ctx.now);
  switch (key) {
    case "new":
      return m.createdAt >= ctx.newSince;
    case "frequent":
      return status === "active" && m.totalVisits >= FREQUENT_MIN_VISITS;
    case "at_risk":
      return status === "at_risk";
    case "inactive":
      return status === "inactive";
    case "one_away":
      return progressOf(m.cycleVisits, ctx.goal).remaining === 1;
    case "reward_available":
      return m.availableRewards > 0;
    case "high_ticket":
      return (
        ctx.programAvgTicket > 0 &&
        m.visitsWithAmount >= 2 &&
        averageTicket(m.totalSpent, m.visitsWithAmount) >= ctx.programAvgTicket * HIGH_TICKET_FACTOR
      );
  }
}

export const SEGMENT_KEYS: SegmentKey[] = ["new", "frequent", "one_away", "reward_available", "high_ticket", "at_risk", "inactive"];

export function segmentCounts(members: MemberLite[], ctx: { goal: number; newSince: Date; now?: Date }): SegmentCounts {
  const now = ctx.now ?? new Date();
  const withAmount = members.reduce((a, m) => a + m.visitsWithAmount, 0);
  const spent = members.reduce((a, m) => a + m.totalSpent, 0);
  const programAvgTicket = averageTicket(spent, withAmount);
  const full = { goal: ctx.goal, programAvgTicket, newSince: ctx.newSince, now };
  const segments = Object.fromEntries(SEGMENT_KEYS.map((k) => [k, 0])) as Record<SegmentKey, number>;
  let active = 0;
  let atRisk = 0;
  let inactive = 0;
  for (const m of members) {
    const s = activityStatus(m.lastVisitAt, m.createdAt, now);
    if (s === "active") active++;
    else if (s === "at_risk") atRisk++;
    else inactive++;
    for (const k of SEGMENT_KEYS) if (inSegment(m, k, full)) segments[k]++;
  }
  return { total: members.length, active, atRisk, inactive, segments };
}

// ─── Insights ───────────────────────────────────────────────────────────

export type InsightKind =
  | "leader_zone"
  | "high_value_zone"
  | "low_frequency_zone"
  | "frequency_drop_zone"
  | "opportunity_zone"
  | "one_away"
  | "rewards_waiting"
  | "reactivation";

export interface Insight {
  kind: InsightKind;
  tone: "positive" | "warning" | "opportunity" | "info";
  postalCode?: string;
  /** Valores con los que se arma el texto (en i18n-loyalty). */
  values: Record<string, number | string>;
}

/**
 * Convierte métricas en decisiones con reglas explícitas. Cada insight sale
 * de un número que se puede ver en el dashboard; si no hay datos suficientes
 * para una regla, esa regla simplemente no produce nada.
 */
export function buildInsights(input: {
  summary: ZoneSummary;
  segments: SegmentCounts;
  availableRewards: number;
}): Insight[] {
  const out: Insight[] = [];
  const { zones, totals } = input.summary;
  const withSales = zones.filter((z) => z.sales > 0);

  if (withSales.length >= 2) {
    const leader = [...withSales].sort((a, b) => b.salesShare - a.salesShare)[0];
    out.push({
      kind: "leader_zone",
      tone: "positive",
      postalCode: leader.postalCode,
      values: { share: leader.salesShare, ticket: leader.avgTicket, overallTicket: totals.avgTicket },
    });

    const hv = zones
      .filter((z) => z.labels.includes("high_value") && z.postalCode !== leader.postalCode)
      .sort((a, b) => b.salesPerMember - a.salesPerMember)[0];
    if (hv && totals.salesPerMember > 0) {
      out.push({
        kind: "high_value_zone",
        tone: "positive",
        postalCode: hv.postalCode,
        values: { members: hv.members, memberShare: hv.memberShare, factor: round1(hv.salesPerMember / totals.salesPerMember) },
      });
    }
  }

  const lowFreq = zones.filter((z) => z.labels.includes("low_frequency")).sort((a, b) => b.members - a.members)[0];
  if (lowFreq) {
    out.push({
      kind: "low_frequency_zone",
      tone: "warning",
      postalCode: lowFreq.postalCode,
      values: { members: lowFreq.members, frequency: lowFreq.frequency, overall: totals.frequency },
    });
  }

  // Caída de frecuencia vs. el periodo anterior: solo zonas con base suficiente.
  const drops = zones
    .filter((z) => z.members >= 10 && (z.prevVisits ?? 0) >= 10 && z.postalCode !== lowFreq?.postalCode)
    .map((z) => ({ z, change: pctOf(z.visits - (z.prevVisits ?? 0), z.prevVisits ?? 0) ?? 0 }))
    .filter((d) => d.change <= -15)
    .sort((a, b) => a.change - b.change)[0];
  if (drops) {
    out.push({
      kind: "frequency_drop_zone",
      tone: "warning",
      postalCode: drops.z.postalCode,
      values: { members: drops.z.members, change: Math.abs(drops.change) },
    });
  }

  const opp = zones.filter((z) => z.labels.includes("opportunity")).sort((a, b) => (a.distanceKm ?? 99) - (b.distanceKm ?? 99))[0];
  if (opp) {
    out.push({
      kind: "opportunity_zone",
      tone: "opportunity",
      postalCode: opp.postalCode,
      values: { distanceKm: opp.distanceKm ?? 0, memberShare: opp.memberShare, members: opp.members },
    });
  }

  if (input.segments.segments.one_away > 0) {
    out.push({ kind: "one_away", tone: "opportunity", values: { count: input.segments.segments.one_away } });
  }
  if (input.availableRewards > 0) {
    out.push({ kind: "rewards_waiting", tone: "info", values: { count: input.availableRewards } });
  }
  const lapsed = input.segments.atRisk + input.segments.inactive;
  if (lapsed > 0) {
    out.push({ kind: "reactivation", tone: "warning", values: { count: lapsed, days: ACTIVE_DAYS } });
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Métrica del mapa ────────────────────────────────────────────────────

export type MapMetric = "members" | "sales" | "share" | "ticket" | "frequency";
export const MAP_METRICS: MapMetric[] = ["members", "sales", "share", "ticket", "frequency"];

export function zoneMetricValue(z: ZoneStats, metric: MapMetric): number {
  switch (metric) {
    case "members":
      return z.members;
    case "sales":
      return z.sales;
    case "share":
      return z.salesShare;
    case "ticket":
      return z.avgTicket;
    case "frequency":
      return z.frequency;
  }
}
