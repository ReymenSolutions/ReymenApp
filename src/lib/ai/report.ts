import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Consultas del ledger de IA para el Admin (IA y Consumo). Solo lectura; las cifras salen de registros reales.

export const AI_PERIODS = ["7d", "30d", "90d", "month"] as const;
export type AiPeriod = (typeof AI_PERIODS)[number];
export const AI_GRANULARITIES = ["day", "week", "month"] as const;
export type AiGranularity = (typeof AI_GRANULARITIES)[number];

export type AiFilters = { period: AiPeriod; granularity: AiGranularity; organizationId?: string; agentKey?: string; provider?: string; model?: string; operation?: string };

export function parseAiFilters(raw: Record<string, string | undefined>): AiFilters {
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[], fallback: T): T => (allowed as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
  const text = (v: string | undefined) => (v && v.length <= 120 ? v : undefined);
  return { period: pick(raw.period, AI_PERIODS, "30d"), granularity: pick(raw.granularity, AI_GRANULARITIES, "day"), organizationId: text(raw.org), agentKey: text(raw.agent), provider: text(raw.provider), model: text(raw.model), operation: text(raw.operation) };
}

/** Rango del periodo: [desde, hasta). "month" = el mes calendario en curso (UTC). */
export function periodRange(period: AiPeriod, now: Date = new Date()): { from: Date; to: Date } {
  const to = new Date(now.getTime() + 1000);
  if (period === "month") return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to };
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  return { from: new Date(now.getTime() - days * 86_400_000), to };
}

function whereOf(f: AiFilters, now?: Date): Prisma.AiUsageWhereInput {
  const { from, to } = periodRange(f.period, now);
  return {
    createdAt: { gte: from, lt: to },
    ...(f.organizationId ? { organizationId: f.organizationId } : {}),
    ...(f.agentKey ? { agentKey: f.agentKey } : {}),
    ...(f.provider ? { provider: f.provider } : {}),
    ...(f.model ? { model: f.model } : {}),
    ...(f.operation ? { operation: f.operation } : {}),
  };
}

const num = (d: Prisma.Decimal | null | undefined) => (d ? Number(d) : 0);

export type AiTotals = {
  calls: number;
  failed: number;
  /** Llamadas exitosas sin tarifa vigente: su costo NO está incluido en las cifras (no se inventa). */
  noRate: number;
  costMxn: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  conversations: number;
  /** Costo promedio por conversación (solo llamadas ligadas a una conversación). */
  avgPerConversationMxn: number | null;
};

export type AiGroupRow = { key: string; label: string; calls: number; costMxn: number; inputTokens: number; outputTokens: number; avgPerCallMxn: number | null; extra?: string };

export type AiOverview = {
  totals: AiTotals;
  byTenant: AiGroupRow[];
  byAgent: AiGroupRow[];
  byModel: AiGroupRow[];
  series: { bucket: string; costMxn: number; calls: number }[];
  /** Modelos usados en el periodo que no tienen tarifa (para avisar que falta cargarla). */
  modelsWithoutRate: { provider: string; model: string; calls: number }[];
};

type GroupAgg = { _count: { _all: number }; _sum: { costMxn: Prisma.Decimal | null; inputTokens: number | null; outputTokens: number | null } };
const sums = { costMxn: true, inputTokens: true, outputTokens: true } as const;
const toRow = (key: string, label: string, g: GroupAgg, extra?: string): AiGroupRow => {
  const costMxn = num(g._sum.costMxn);
  return { key, label, calls: g._count._all, costMxn, inputTokens: g._sum.inputTokens ?? 0, outputTokens: g._sum.outputTokens ?? 0, avgPerCallMxn: g._count._all > 0 ? costMxn / g._count._all : null, extra };
};

export async function getAiOverview(f: AiFilters, now: Date = new Date()): Promise<AiOverview> {
  const where = whereOf(f, now);
  const [agg, usd, failed, noRate, convs, convCost, tenants, agents, models, noRateModels] = await Promise.all([
    prisma.aiUsage.aggregate({ where, _count: { _all: true }, _sum: { costMxn: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, reasoningTokens: true } }),
    prisma.aiUsage.aggregate({ where: { ...where, currencyOriginal: "USD" }, _sum: { costOriginal: true } }),
    prisma.aiUsage.count({ where: { ...where, status: { in: ["FAILED", "REFUSED"] } } }),
    prisma.aiUsage.count({ where: { ...where, status: "SUCCEEDED", costBasis: "NO_RATE" } }),
    prisma.aiUsage.findMany({ where: { ...where, conversationId: { not: null } }, distinct: ["organizationId", "conversationId"], select: { id: true } }),
    prisma.aiUsage.aggregate({ where: { ...where, conversationId: { not: null } }, _sum: { costMxn: true } }),
    prisma.aiUsage.groupBy({ by: ["organizationId"], where, _count: { _all: true }, _sum: sums, orderBy: { _sum: { costMxn: "desc" } }, take: 50 }),
    prisma.aiUsage.groupBy({ by: ["agentKey"], where, _count: { _all: true }, _sum: sums, orderBy: { _sum: { costMxn: "desc" } }, take: 50 }),
    prisma.aiUsage.groupBy({ by: ["provider", "model"], where, _count: { _all: true }, _sum: sums, orderBy: { _sum: { costMxn: "desc" } }, take: 50 }),
    prisma.aiUsage.groupBy({ by: ["provider", "model"], where: { ...where, status: "SUCCEEDED", costBasis: "NO_RATE" }, _count: { _all: true } }),
  ]);

  const orgs = await prisma.organization.findMany({ where: { id: { in: tenants.map((t) => t.organizationId) } }, select: { id: true, name: true, plan: true } });
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  const { from, to } = periodRange(f.period, now);
  const conditions: Prisma.Sql[] = [Prisma.sql`"createdAt" >= ${from}`, Prisma.sql`"createdAt" < ${to}`];
  if (f.organizationId) conditions.push(Prisma.sql`"organizationId" = ${f.organizationId}`);
  if (f.agentKey) conditions.push(Prisma.sql`"agentKey" = ${f.agentKey}`);
  if (f.provider) conditions.push(Prisma.sql`"provider" = ${f.provider}`);
  if (f.model) conditions.push(Prisma.sql`"model" = ${f.model}`);
  if (f.operation) conditions.push(Prisma.sql`"operation" = ${f.operation}`);
  // La granularidad solo puede ser uno de tres valores fijos (se valida al leer los filtros): nunca texto del usuario.
  const unit = Prisma.raw(`'${f.granularity}'`);
  const seriesRows = await prisma.$queryRaw<{ bucket: Date; cost: Prisma.Decimal | null; calls: bigint }[]>(
    Prisma.sql`SELECT date_trunc(${unit}, "createdAt") AS bucket, SUM("costMxn") AS cost, COUNT(*) AS calls FROM "AiUsage" WHERE ${Prisma.join(conditions, " AND ")} GROUP BY 1 ORDER BY 1`,
  );

  const conversations = convs.length;
  const totals: AiTotals = {
    calls: agg._count._all,
    failed,
    noRate,
    costMxn: num(agg._sum.costMxn),
    costUsd: num(usd._sum.costOriginal),
    inputTokens: agg._sum.inputTokens ?? 0,
    outputTokens: agg._sum.outputTokens ?? 0,
    cacheReadTokens: agg._sum.cacheReadTokens ?? 0,
    cacheWriteTokens: agg._sum.cacheWriteTokens ?? 0,
    reasoningTokens: agg._sum.reasoningTokens ?? 0,
    conversations,
    avgPerConversationMxn: conversations > 0 ? num(convCost._sum.costMxn) / conversations : null,
  };
  return {
    totals,
    byTenant: tenants.map((t) => toRow(t.organizationId, orgById.get(t.organizationId)?.name ?? t.organizationId, t, orgById.get(t.organizationId)?.plan)),
    byAgent: agents.map((a) => toRow(a.agentKey ?? "—", a.agentKey ?? "—", a)),
    byModel: models.map((m) => toRow(`${m.provider}:${m.model}`, `${m.provider} · ${m.model}`, m)),
    series: seriesRows.map((r) => ({ bucket: r.bucket.toISOString().slice(0, 10), costMxn: num(r.cost), calls: Number(r.calls) })),
    modelsWithoutRate: noRateModels.map((m) => ({ provider: m.provider, model: m.model, calls: m._count._all })),
  };
}

export type AiHistoryRow = { id: string; createdAt: Date; organization: string; agentKey: string | null; operation: string; origin: string; provider: string; model: string; status: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costMxn: number | null; costBasis: string; conversationId: string | null; latencyMs: number | null; errorCode: string | null };

export const AI_HISTORY_PAGE_SIZE = 50;

export async function getAiHistory(f: AiFilters, page: number, now?: Date): Promise<{ rows: AiHistoryRow[]; total: number }> {
  const where = whereOf(f, now);
  const [rows, total] = await Promise.all([
    prisma.aiUsage.findMany({ where, orderBy: { createdAt: "desc" }, skip: (Math.max(1, page) - 1) * AI_HISTORY_PAGE_SIZE, take: AI_HISTORY_PAGE_SIZE, include: { organization: { select: { name: true } } } }),
    prisma.aiUsage.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((r) => ({ id: r.id, createdAt: r.createdAt, organization: r.organization.name, agentKey: r.agentKey, operation: r.operation, origin: r.origin, provider: r.provider, model: r.model, status: r.status, inputTokens: r.inputTokens, outputTokens: r.outputTokens, cacheReadTokens: r.cacheReadTokens, cacheWriteTokens: r.cacheWriteTokens, costMxn: r.costMxn ? Number(r.costMxn) : null, costBasis: r.costBasis, conversationId: r.conversationId, latencyMs: r.latencyMs, errorCode: r.errorCode })),
  };
}

/** Escapa una celda de CSV; además neutraliza fórmulas (=, +, -, @) para que abrirlo en una hoja de cálculo no ejecute nada. */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_MAX_ROWS = 50_000;

export async function getAiUsageCsv(f: AiFilters, now?: Date): Promise<string> {
  const rows = await prisma.aiUsage.findMany({ where: whereOf(f, now), orderBy: { createdAt: "asc" }, take: CSV_MAX_ROWS, include: { organization: { select: { name: true } } } });
  const header = ["fecha", "tenant", "agente", "operacion", "origen", "proveedor", "modelo", "estado", "tokens_entrada", "tokens_salida", "tokens_cache_lectura", "tokens_cache_escritura", "tokens_razonamiento", "costo_original", "moneda", "tipo_cambio", "costo_mxn", "base_costo", "conversacion", "latencia_ms"];
  const lines = rows.map((r) => [r.createdAt.toISOString(), r.organization.name, r.agentKey, r.operation, r.origin, r.provider, r.model, r.status, r.inputTokens, r.outputTokens, r.cacheReadTokens, r.cacheWriteTokens, r.reasoningTokens, r.costOriginal?.toString(), r.currencyOriginal, r.fxRate?.toString(), r.costMxn?.toString(), r.costBasis, r.conversationId, r.latencyMs].map(csvCell).join(","));
  return [header.join(","), ...lines].join("\n");
}
