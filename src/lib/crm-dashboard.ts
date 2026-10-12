import { prisma } from "@/lib/prisma";

export type PipelineStageSummary = { id: string; name: string; count: number; total: number; share: number };
export type PipelineSummary = {
  currency: string;
  total: number;
  count: number;
  byStage: PipelineStageSummary[];
  /** Montos abiertos en otras monedas (no se mezclan con la principal). */
  otherCurrencies: { currency: string; total: number }[];
};

type StageRow = { id: string; name: string; isWon: boolean; isLost: boolean };
type OppRow = { amount: number | null; currency: string; pipelineStageId: string };

/**
 * Valor del pipeline abierto (etapas que no son ganada ni perdida). Los montos se agrupan por moneda y la
 * principal es la de mayor total: nunca se suman pesos con dólares.
 */
export function buildPipelineSummary(stages: StageRow[], opportunities: OppRow[]): PipelineSummary | null {
  const open = new Map(stages.filter((s) => !s.isWon && !s.isLost).map((s) => [s.id, s]));
  const rows = opportunities.filter((o) => open.has(o.pipelineStageId));
  if (open.size === 0) return null;

  const byCurrency = new Map<string, number>();
  for (const o of rows) byCurrency.set(o.currency, (byCurrency.get(o.currency) ?? 0) + (o.amount ?? 0));
  const ranked = [...byCurrency.entries()].sort((a, b) => b[1] - a[1]);
  const currency = ranked[0]?.[0] ?? "MXN";
  const total = ranked[0]?.[1] ?? 0;

  const inMain = rows.filter((o) => o.currency === currency);
  const byStage = stages
    .filter((s) => open.has(s.id))
    .map((s) => {
      const list = inMain.filter((o) => o.pipelineStageId === s.id);
      const stageTotal = list.reduce((sum, o) => sum + (o.amount ?? 0), 0);
      return { id: s.id, name: s.name, count: rows.filter((o) => o.pipelineStageId === s.id).length, total: stageTotal, share: total > 0 ? Math.round((stageTotal / total) * 100) : 0 };
    });

  return { currency, total, count: rows.length, byStage, otherCurrencies: ranked.slice(1).map(([c, t]) => ({ currency: c, total: t })) };
}

/** Variación porcentual contra el periodo anterior; null si no hay base para comparar. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export async function getCrmDashboard(orgId: string, now: Date = new Date()) {
  const day = 86_400_000;
  const last7 = new Date(now.getTime() - 7 * day);
  const prev7 = new Date(now.getTime() - 14 * day);
  const [stages, opportunities, leadsLast7, leadsPrev7] = await Promise.all([
    prisma.pipelineStage.findMany({ where: { organizationId: orgId }, orderBy: { order: "asc" }, select: { id: true, name: true, isWon: true, isLost: true } }),
    prisma.opportunity.findMany({ where: { organizationId: orgId }, select: { amount: true, currency: true, pipelineStageId: true } }),
    prisma.lead.count({ where: { organizationId: orgId, deletedAt: null, createdAt: { gte: last7 } } }),
    prisma.lead.count({ where: { organizationId: orgId, deletedAt: null, createdAt: { gte: prev7, lt: last7 } } }),
  ]);
  return {
    pipeline: buildPipelineSummary(stages, opportunities),
    leads: { last7: leadsLast7, prev7: leadsPrev7, change: percentChange(leadsLast7, leadsPrev7) },
  };
}
