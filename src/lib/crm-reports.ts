import { prisma } from "./prisma";

export type ReportRange = "30" | "90" | "365" | "all";
export const REPORT_RANGES: ReportRange[] = ["30", "90", "365", "all"];
export const DEFAULT_REPORT_RANGE: ReportRange = "90";

export function parseReportRange(value: string | undefined): ReportRange {
  return REPORT_RANGES.includes(value as ReportRange) ? (value as ReportRange) : DEFAULT_REPORT_RANGE;
}

export function rangeStart(range: ReportRange, now = new Date()): Date | null {
  return range === "all" ? null : new Date(now.getTime() - Number(range) * 24 * 3600_000);
}

const DAY = 24 * 3600_000;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Agrupa textos escritos a mano que son lo mismo ("Muy caro", "muy caro ", "MUY CARO"). */
export function normalizeText(text: string | null | undefined): string | null {
  const t = text?.trim().replace(/\s+/g, " ");
  return t ? t : null;
}

export interface SourceRow {
  source: string | null;
  leads: number;
  won: number;
  lost: number;
  /** Ganados / leads (0..1). */
  conversion: number;
  /** Dinero de las oportunidades ganadas de esos leads, por moneda (no se mezclan monedas). */
  revenue: { currency: string; amount: number }[];
}

export interface CrmReport {
  range: ReportRange;
  /** Leads que llegaron en el periodo, por fuente: de dónde vienen los que sí compran. */
  sources: SourceRow[];
  /** Ventas ganadas en el periodo: cuánto tardan en cerrar. */
  closing: {
    count: number;
    avgDaysFromLead: number | null;
    medianDaysFromLead: number | null;
    avgDaysFromOpportunity: number | null;
    medianDaysFromOpportunity: number | null;
  };
  /** Oportunidades perdidas en el periodo: por qué y dónde se caen. */
  losses: {
    total: number;
    reasons: { reason: string | null; count: number }[];
    /** Etapa en la que estaba cuando se perdió (solo se conoce desde que se empezó a registrar). */
    fromStage: { stage: string; count: number }[];
    fromStageKnown: number;
  };
}

function addRevenue(map: Map<string, number>, currency: string, amount: number) {
  map.set(currency, (map.get(currency) ?? 0) + amount);
}

export async function getCrmReport(orgId: string, range: ReportRange, now = new Date()): Promise<CrmReport> {
  const since = rangeStart(range, now);
  const leadScope = { organizationId: orgId, deletedAt: null, ...(since ? { createdAt: { gte: since } } : {}) };
  const closedScope = since ? { gte: since } : undefined;

  const [sourceStatus, wonByLead, wonClosed, lostClosed, stages] = await Promise.all([
    prisma.lead.groupBy({ by: ["source", "status"], where: leadScope, _count: { id: true } }),
    prisma.opportunity.findMany({
      where: { organizationId: orgId, amount: { not: null }, pipelineStage: { isWon: true }, lead: leadScope },
      select: { amount: true, currency: true, lead: { select: { source: true } } },
    }),
    prisma.opportunity.findMany({
      where: { organizationId: orgId, pipelineStage: { isWon: true }, closedAt: closedScope ?? { not: null }, lead: { deletedAt: null } },
      select: { createdAt: true, closedAt: true, lead: { select: { createdAt: true } } },
    }),
    prisma.opportunity.findMany({
      where: { organizationId: orgId, pipelineStage: { isLost: true }, closedAt: closedScope ?? { not: null } },
      select: { id: true, lossReason: true },
    }),
    prisma.pipelineStage.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, isLost: true } }),
  ]);

  // ── Fuentes (sin distinguir mayúsculas) ──
  const bySource = new Map<string, SourceRow & { _rev: Map<string, number> }>();
  const keyOf = (s: string | null) => normalizeText(s)?.toLowerCase() ?? "";
  const row = (source: string | null) => {
    const key = keyOf(source);
    let r = bySource.get(key);
    if (!r) {
      r = { source: normalizeText(source), leads: 0, won: 0, lost: 0, conversion: 0, revenue: [], _rev: new Map() };
      bySource.set(key, r);
    }
    return r;
  };
  for (const g of sourceStatus) {
    const r = row(g.source);
    r.leads += g._count.id;
    if (g.status === "WON") r.won += g._count.id;
    if (g.status === "LOST") r.lost += g._count.id;
  }
  for (const o of wonByLead) addRevenue(row(o.lead.source)._rev, o.currency, o.amount ?? 0);
  const sources = [...bySource.values()]
    .map(({ _rev, ...r }) => ({
      ...r,
      conversion: r.leads ? r.won / r.leads : 0,
      revenue: [..._rev.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount),
    }))
    .sort((a, b) => b.won - a.won || b.leads - a.leads);

  // ── Tiempo de cierre ──
  const fromLead = wonClosed.filter((o) => o.closedAt).map((o) => Math.max(0, (o.closedAt!.getTime() - o.lead.createdAt.getTime()) / DAY));
  const fromOpp = wonClosed.filter((o) => o.closedAt).map((o) => Math.max(0, (o.closedAt!.getTime() - o.createdAt.getTime()) / DAY));
  const closing = {
    count: fromLead.length,
    avgDaysFromLead: average(fromLead),
    medianDaysFromLead: median(fromLead),
    avgDaysFromOpportunity: average(fromOpp),
    medianDaysFromOpportunity: median(fromOpp),
  };

  // ── Pérdidas: motivo y etapa en la que estaban ──
  const reasonCounts = new Map<string, { reason: string | null; count: number }>();
  for (const o of lostClosed) {
    const reason = normalizeText(o.lossReason);
    const key = reason?.toLowerCase() ?? "";
    const cur = reasonCounts.get(key) ?? { reason, count: 0 };
    cur.count += 1;
    reasonCounts.set(key, cur);
  }
  const reasons = [...reasonCounts.values()].sort((a, b) => b.count - a.count);

  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  const lostStageIds = new Set(stages.filter((s) => s.isLost).map((s) => s.id));
  const lostIds = lostClosed.map((o) => o.id);
  const fromStageCounts = new Map<string, number>();
  let fromStageKnown = 0;
  if (lostIds.length) {
    // Última entrada a una etapa perdida de cada oportunidad: el movimiento (con la etapa de origen) o el "perdida" (con su nombre).
    const audits = await prisma.auditLog.findMany({
      where: { organizationId: orgId, resource: "Opportunity", resourceId: { in: lostIds }, action: { in: ["opportunity.stage_change", "opportunity.lost"] } },
      orderBy: { createdAt: "desc" },
    });
    const seen = new Set<string>();
    for (const a of audits) {
      if (!a.resourceId || seen.has(a.resourceId)) continue;
      const m = (a.metadata ?? {}) as { fromStageId?: string; toStageId?: string; fromStageName?: string };
      let from: string | undefined;
      if (a.action === "opportunity.stage_change" && m.toStageId && lostStageIds.has(m.toStageId) && m.fromStageId) from = stageName.get(m.fromStageId);
      if (a.action === "opportunity.lost") from = m.fromStageName;
      if (!from) continue;
      seen.add(a.resourceId);
      fromStageKnown += 1;
      fromStageCounts.set(from, (fromStageCounts.get(from) ?? 0) + 1);
    }
  }
  const fromStage = [...fromStageCounts.entries()].map(([stage, count]) => ({ stage, count })).sort((a, b) => b.count - a.count);

  return { range, sources, closing, losses: { total: lostClosed.length, reasons, fromStage, fromStageKnown } };
}
