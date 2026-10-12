import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getOrganizationExecutions } from "@/actions/admin/executions";
import { EXECUTIONS_PAGE_SIZE } from "@/lib/automation/retry";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RetryExecutionButton } from "@/components/admin/RetryExecutionButton";
import { EXECUTION_LABEL, SKIP_REASON, describeAction } from "@/lib/automation/labels";
import { formatDateTime, formatMoney } from "@/lib/utils";

const STATUS_OPTIONS = ["FAILED", "SKIPPED", "PENDING", "DISPATCHED", "SUCCEEDED", "DRY_RUN"] as const;
const PERIODS = [7, 30, 90] as const;

type Search = { automation?: string; status?: string; days?: string; page?: string };

export default async function ClientAutomationsPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<Search> }) {
  const [{ clientId }, sp] = await Promise.all([params, searchParams]);
  const org = await prisma.organization.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!org) notFound();

  const days = PERIODS.includes(Number(sp.days) as 7 | 30 | 90) ? Number(sp.days) : 30;
  const status = (STATUS_OPTIONS as readonly string[]).includes(sp.status ?? "") ? (sp.status as (typeof STATUS_OPTIONS)[number]) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const view = await getOrganizationExecutions({ orgId: org.id, automationId: sp.automation || undefined, status, days, page });
  const pages = Math.max(1, Math.ceil(view.total / EXECUTIONS_PAGE_SIZE));

  const href = (over: Partial<Search>) => {
    const q = new URLSearchParams();
    const merged = { automation: sp.automation, status: sp.status, days: String(days), page: undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, String(v));
    return `/admin/clients/${org.id}/automations?${q.toString()}`;
  };

  const s = view.summary;
  const total = Object.values(s.byStatus).reduce((a, b) => a + (b ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/clients/${org.id}#blueprints`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Volver al cliente
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Ejecuciones de automatizaciones — {org.name}</h1>
        <p className="text-sm text-slate-500">Qué hizo cada automatización inteligente con cada evento, por qué no actuó, qué falló y qué ventas se le asocian. Últimos {days} días.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Ejecuciones", value: String(total), href: href({ status: undefined }) },
          { label: "Fallidas", value: String(s.failed), tone: s.failed > 0 ? "text-red-600" : "", href: href({ status: "FAILED" }) },
          { label: "Mensajes enviados", value: String(s.touches) },
          { label: "Ventas asociadas", value: String(s.conversions) },
          { label: "Ingresos asociados", value: formatMoney(s.revenue) },
        ].map((c) => {
          const body = (
            <Card className="h-full">
              <CardContent className="p-4">
                <p className={`text-2xl font-semibold tabular-nums text-slate-900 ${c.tone ?? ""}`}>{c.value}</p>
                <p className="text-xs text-slate-500">{c.label}</p>
              </CardContent>
            </Card>
          );
          return c.href ? (
            <Link key={c.label} href={c.href}>
              {body}
            </Link>
          ) : (
            <div key={c.label}>{body}</div>
          );
        })}
      </div>
      <p className="-mt-3 text-xs text-slate-400">Ingresos <strong>asociados</strong> (último mensaje en los 7 días previos a comprar, una venta por automatización, sin cancelaciones): no prueban que la automatización los provocó.</p>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-card border border-slate-200 bg-white p-3">
        <label className="text-xs font-medium text-slate-600">
          Automatización
          <select name="automation" defaultValue={sp.automation ?? ""} className="mt-1 block h-9 rounded-md border border-slate-200 bg-transparent px-2 text-sm">
            <option value="">Todas</option>
            {view.automations.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Estado
          <select name="status" defaultValue={status ?? ""} className="mt-1 block h-9 rounded-md border border-slate-200 bg-transparent px-2 text-sm">
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((st) => (
              <option key={st} value={st}>
                {EXECUTION_LABEL[st].label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Periodo
          <select name="days" defaultValue={String(days)} className="mt-1 block h-9 rounded-md border border-slate-200 bg-transparent px-2 text-sm">
            {PERIODS.map((d) => (
              <option key={d} value={d}>
                Últimos {d} días
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-9 rounded-md bg-brand-600 px-4 text-sm font-medium text-[rgb(255_255_255)] hover:bg-brand-700">
          Filtrar
        </button>
      </form>

      <Card>
        <CardHeader className="pb-2">
          <p className="text-sm font-semibold text-slate-900">
            {view.total} {view.total === 1 ? "ejecución" : "ejecuciones"}
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {view.rows.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No hay ejecuciones con estos filtros.</p>}
          {view.rows.map((r) => {
            const meta = EXECUTION_LABEL[r.status] ?? { label: r.status, variant: "secondary" as const };
            const summary = describeAction(r.action, formatMoney);
            return (
              <div key={r.id} className="rounded-card border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {r.automationName} <span className="font-normal text-slate-500">· {r.subjectLabel}</span>
                    </p>
                    {summary && <p className="text-xs text-slate-600">{summary}</p>}
                    {r.skipReason && <p className="text-xs text-slate-500">Omitida: {SKIP_REASON[r.skipReason] ?? r.skipReason}</p>}
                    {r.lastError && <p className="text-xs font-medium text-red-600">Error: {r.lastError}</p>}
                    {r.conversion && (
                      <p className="mt-0.5 text-xs text-emerald-700">
                        {r.conversion.reverted ? "Venta asociada revertida por cancelación" : `Venta asociada: ${formatMoney(r.conversion.revenue)}`} · {formatDateTime(r.conversion.saleAt)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    <span className="text-xs text-slate-400">{formatDateTime(r.createdAt)}</span>
                    {r.status === "FAILED" && <RetryExecutionButton orgId={org.id} executionId={r.id} disabledReason={r.retry.allowed ? undefined : r.retry.reason} />}
                  </div>
                </div>
                <details className="mt-2 text-xs text-slate-600">
                  <summary className="cursor-pointer font-medium text-brand-700">Seguir la cadena (evento → ejecución → resultado → venta)</summary>
                  <ol className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">
                    <li>
                      <strong>Evento</strong> <code>{r.event.type}</code> · {formatDateTime(r.event.occurredAt)} · id <code>{r.event.id}</code>
                      {r.event.correlationId && (
                        <>
                          {" "}
                          · correlación <code>{r.event.correlationId}</code>
                        </>
                      )}
                    </li>
                    <li>
                      <strong>Ejecución</strong> id <code>{r.id}</code> · {meta.label} · {r.attempts} {r.attempts === 1 ? "intento" : "intentos"}
                      {r.nextAttemptAt && <> · próximo intento {formatDateTime(r.nextAttemptAt)}</>}
                    </li>
                    {r.dispatchedAt && <li><strong>Enviada a n8n</strong> {formatDateTime(r.dispatchedAt)}</li>}
                    {r.completedAt && (
                      <li>
                        <strong>Resultado</strong> {formatDateTime(r.completedAt)}
                        {r.providerMessageId && <> · id del proveedor <code>{r.providerMessageId}</code></>}
                      </li>
                    )}
                    {r.touchedAt && <li><strong>Contacto registrado</strong> {formatDateTime(r.touchedAt)}</li>}
                    {r.conversion && <li><strong>Venta</strong> id <code>{r.conversion.saleId}</code> · {formatMoney(r.conversion.revenue)}{r.conversion.reverted ? " (revertida)" : ""}</li>}
                    {r.status === "FAILED" && !r.retry.allowed && <li className="text-amber-700">No se puede reintentar: {r.retry.reason}</li>}
                  </ol>
                </details>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {pages > 1 && (
        <nav aria-label="Paginación" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={href({ page: String(page - 1) })} className="text-brand-700 hover:underline">← Anteriores</Link> : <span />}
          <span className="text-slate-500">Página {page} de {pages}</span>
          {page < pages ? <Link href={href({ page: String(page + 1) })} className="text-brand-700 hover:underline">Siguientes →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
