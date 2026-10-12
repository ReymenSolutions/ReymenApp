import Link from "next/link";
import { Activity, Bot, Coins, Cpu, Gauge, MessagesSquare } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getServerLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/EmptyState";
import { AiCostChart } from "@/components/charts/AiCostChart";
import { AiRateForm } from "@/components/admin/AiRateForm";
import { AiCsvButton } from "@/components/admin/AiCsvButton";
import { listProviders } from "@/lib/ai/providers";
import { AI_GRANULARITIES, AI_HISTORY_PAGE_SIZE, AI_PERIODS, getAiHistory, getAiOverview, parseAiFilters, type AiGroupRow } from "@/lib/ai/report";
import { formatDateTime, formatMoney } from "@/lib/utils";

type SearchParams = { period?: string; granularity?: string; org?: string; agent?: string; provider?: string; model?: string; operation?: string; page?: string };

const PERIOD_LABEL = { "7d": { es: "7 días", en: "7 days" }, "30d": { es: "30 días", en: "30 days" }, "90d": { es: "90 días", en: "90 days" }, month: { es: "Mes en curso", en: "This month" } } as const;
const GRAN_LABEL = { day: { es: "Diario", en: "Daily" }, week: { es: "Semanal", en: "Weekly" }, month: { es: "Mensual", en: "Monthly" } } as const;
const compact = (n: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** Admin → IA y Consumo: cuánto cuesta la IA de Reymen, por tenant, agente y modelo. Todo sale del ledger real (sin datos simulados). */
export default async function AdminAiPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const es = (await getServerLang()) === "es";
  const filters = parseAiFilters(sp);
  const page = Math.max(1, Number(sp.page) || 1);

  const [overview, history, orgs, rates, options] = await Promise.all([
    getAiOverview(filters),
    getAiHistory(filters, page),
    prisma.organization.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.aiRate.findMany({ orderBy: [{ provider: "asc" }, { model: "asc" }, { effectiveFrom: "desc" }], take: 100 }),
    prisma.aiUsage.findMany({ distinct: ["agentKey", "provider", "model", "operation"], select: { agentKey: true, provider: true, model: true, operation: true }, take: 500 }),
  ]);
  const { totals } = overview;
  const agents = [...new Set(options.map((o) => o.agentKey).filter((a): a is string => !!a))].sort();
  const models = [...new Set(options.map((o) => o.model))].sort();
  const providerNames = [...new Set(options.map((o) => o.provider))].sort();
  const operations = [...new Set(options.map((o) => o.operation))].sort();

  const qs = (over: Record<string, string | undefined>) => {
    const base: Record<string, string | undefined> = { period: filters.period, granularity: filters.granularity, org: filters.organizationId, agent: filters.agentKey, provider: filters.provider, model: filters.model, operation: filters.operation, ...over };
    return `/admin/ai?${new URLSearchParams(Object.entries(base).filter(([, v]) => !!v) as [string, string][]).toString()}`;
  };
  const pages = Math.max(1, Math.ceil(history.total / AI_HISTORY_PAGE_SIZE));
  const select = "h-9 rounded-md border border-slate-200 bg-transparent px-2 text-sm";

  const table = (title: string, rows: AiGroupRow[], opts: { showPlan?: boolean } = {}) => (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-slate-400">{es ? "Sin datos en este periodo" : "No data in this period"}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-6">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-medium text-slate-900">{r.label}</p>
                  <p className="text-xs text-slate-500">
                    {r.calls.toLocaleString("en-US")} {es ? "llamadas" : "calls"} · {compact(r.inputTokens)} {es ? "entrada" : "in"} / {compact(r.outputTokens)} {es ? "salida" : "out"}
                    {opts.showPlan && r.extra ? ` · ${r.extra}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-900">{formatMoney(r.costMxn)} MXN</p>
                  {r.avgPerCallMxn !== null && <p className="text-xs text-slate-500">{formatMoney(r.avgPerCallMxn, { maximumFractionDigits: 4 })} / {es ? "llamada" : "call"}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={es ? "IA y Consumo" : "AI & Usage"}
        description={es ? "Cuánto cuesta la IA de Reymen por cliente, agente y modelo. Cifras reales del registro de uso; el costo es estimado (tokens × tarifa vigente) hasta conciliarlo con la factura del proveedor." : "How much Reymen's AI costs per client, agent and model. Real figures from the usage ledger; cost is estimated (tokens × current rate) until reconciled with the provider's invoice."}
        actions={<AiCsvButton filters={{ period: filters.period, granularity: filters.granularity, org: filters.organizationId, agent: filters.agentKey, provider: filters.provider, model: filters.model, operation: filters.operation }} />}
      />

      <form className="flex flex-wrap items-end gap-3" action="/admin/ai">
        {([
          ["period", es ? "Periodo" : "Period", filters.period, AI_PERIODS.map((p) => [p, PERIOD_LABEL[p][es ? "es" : "en"]] as const)],
          ["granularity", es ? "Gráfica" : "Chart", filters.granularity, AI_GRANULARITIES.map((g) => [g, GRAN_LABEL[g][es ? "es" : "en"]] as const)],
          ["org", es ? "Cliente" : "Client", filters.organizationId ?? "", [["", es ? "Todos" : "All"] as const, ...orgs.map((o) => [o.id, o.name] as const)]],
          ["agent", es ? "Agente" : "Agent", filters.agentKey ?? "", [["", es ? "Todos" : "All"] as const, ...agents.map((a) => [a, a] as const)]],
          ["provider", es ? "Proveedor" : "Provider", filters.provider ?? "", [["", es ? "Todos" : "All"] as const, ...providerNames.map((p) => [p, p] as const)]],
          ["model", es ? "Modelo" : "Model", filters.model ?? "", [["", es ? "Todos" : "All"] as const, ...models.map((m) => [m, m] as const)]],
          ["operation", es ? "Operación" : "Operation", filters.operation ?? "", [["", es ? "Todas" : "All"] as const, ...operations.map((o) => [o, o] as const)]],
        ] as const).map(([name, label, value, opts]) => (
          <label key={name} className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            {label}
            <select name={name} defaultValue={value} className={select}>
              {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        ))}
        <button type="submit" className="h-9 rounded-md bg-brand-600 px-3 text-sm font-medium text-white hover:bg-brand-700">{es ? "Aplicar" : "Apply"}</button>
      </form>

      {overview.modelsWithoutRate.length > 0 && (
        <p role="note" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {es ? "Hay llamadas sin tarifa cargada: su costo NO está incluido en las cifras (no se inventa). Agrega la tarifa abajo para: " : "Some calls have no rate loaded: their cost is NOT included in the figures (it is not invented). Add the rate below for: "}
          {overview.modelsWithoutRate.map((m) => `${m.provider} · ${m.model} (${m.calls})`).join(", ")}.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title={es ? "Costo estimado (MXN)" : "Estimated cost (MXN)"} value={`${formatMoney(totals.costMxn)}`} description={`≈ $${totals.costUsd.toFixed(2)} USD`} icon={Coins} variant="hero" />
        <MetricCard title={es ? "Llamadas" : "Calls"} value={totals.calls} description={totals.failed ? `${totals.failed} ${es ? "con error o rechazo" : "failed or refused"}` : undefined} icon={Activity} />
        <MetricCard title={es ? "Costo por conversación" : "Cost per conversation"} value={totals.avgPerConversationMxn !== null ? `${formatMoney(totals.avgPerConversationMxn, { maximumFractionDigits: 4 })}` : "—"} description={`${totals.conversations} ${es ? "conversaciones" : "conversations"}`} icon={MessagesSquare} />
        <MetricCard title={es ? "Tokens (entrada / salida)" : "Tokens (in / out)"} value={`${compact(totals.inputTokens)} / ${compact(totals.outputTokens)}`} description={`${es ? "Caché" : "Cache"}: ${compact(totals.cacheReadTokens)} ${es ? "leídos" : "read"} · ${compact(totals.cacheWriteTokens)} ${es ? "escritos" : "written"}${totals.reasoningTokens ? ` · ${compact(totals.reasoningTokens)} ${es ? "razonamiento" : "reasoning"}` : ""}`} icon={Cpu} />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Gauge className="h-4 w-4" />{es ? "Evolución del costo" : "Cost over time"}</CardTitle></CardHeader>
        <CardContent><AiCostChart data={overview.series} /></CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {table(es ? "Consumo por cliente" : "Usage by client", overview.byTenant, { showPlan: true })}
        {table(es ? "Consumo por agente" : "Usage by agent", overview.byAgent)}
      </div>
      {table(es ? "Proveedores y modelos" : "Providers and models", overview.byModel)}

      <Card>
        <CardHeader><CardTitle>{es ? "Tarifas de modelos" : "Model rates"}</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          {rates.length === 0 ? (
            <EmptyState icon={Bot} title={es ? "Aún no hay tarifas" : "No rates yet"} description={es ? "Sin tarifa, las llamadas se registran (tokens) pero su costo queda marcado “sin tarifa”." : "Without a rate, calls are logged (tokens) but their cost is marked “no rate”."} />
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
              {rates.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                  <span className="min-w-[12rem] flex-1 font-medium text-slate-900">{r.provider} · {r.model}</span>
                  <span className="text-xs text-slate-600">
                    {es ? "Entrada" : "In"} {Number(r.inputPerMTok)} · {es ? "Salida" : "Out"} {Number(r.outputPerMTok)} {r.currency}/{es ? "M tokens" : "M tokens"}
                    {r.cacheReadPerMTok !== null ? ` · ${es ? "caché lect." : "cache read"} ${Number(r.cacheReadPerMTok)}` : ""}
                    {r.cacheWritePerMTok !== null ? ` · ${es ? "caché escr." : "cache write"} ${Number(r.cacheWritePerMTok)}` : ""}
                  </span>
                  <span className="text-xs text-slate-500">{es ? "desde" : "from"} {r.effectiveFrom.toISOString().slice(0, 10)} · {r.source}</span>
                </li>
              ))}
            </ul>
          )}
          <AiRateForm providers={listProviders().map((p) => p.name)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{es ? "Historial de ejecuciones" : "Execution history"}</CardTitle></CardHeader>
        <CardContent className="p-0">
          {history.rows.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-slate-400">{es ? "Sin llamadas en este periodo" : "No calls in this period"}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:px-6">
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-medium text-slate-900">{r.organization} <span className="font-normal text-slate-500">· {r.agentKey ?? "—"} · {r.operation}</span></p>
                    <p className="text-xs text-slate-500">{formatDateTime(r.createdAt)} · {r.provider} · {r.model} · {r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens}/{r.outputTokens} tokens{r.latencyMs !== null ? ` · ${r.latencyMs} ms` : ""}{r.errorCode ? ` · ${r.errorCode}` : ""}</p>
                  </div>
                  <Badge variant={r.status === "SUCCEEDED" ? "success" : r.status === "PENDING" ? "secondary" : "destructive"} className="text-[10px]">{r.status}</Badge>
                  <p className="w-28 text-right text-sm font-semibold text-slate-900">{r.costMxn !== null ? `${formatMoney(r.costMxn, { maximumFractionDigits: 4 })} MXN` : es ? "sin tarifa" : "no rate"}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>{es ? `Página ${page} de ${pages}` : `Page ${page} of ${pages}`}</span>
          <span className="flex gap-3">
            {page > 1 && <Link href={qs({ page: String(page - 1) })} className="font-medium text-brand-700 hover:underline">{es ? "← Anterior" : "← Previous"}</Link>}
            {page < pages && <Link href={qs({ page: String(page + 1) })} className="font-medium text-brand-700 hover:underline">{es ? "Siguiente →" : "Next →"}</Link>}
          </span>
        </div>
      )}
    </div>
  );
}
