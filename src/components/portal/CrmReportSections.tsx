import Link from "next/link";
import { Clock, TrendingDown, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import {
  REPORT_RANGES,
  type CrmReport,
  type ReportRange,
} from "@/lib/crm-reports";

const COPY = {
  es: {
    title: "¿Qué está funcionando?",
    range: {
      "30": "30 días",
      "90": "90 días",
      "365": "1 año",
      all: "Todo",
    } as Record<ReportRange, string>,
    sourcesTitle: "¿De dónde vienen los que sí compran?",
    sourcesHint: "Contactos que llegaron en este periodo, por fuente.",
    source: "Fuente",
    leads: "Contactos",
    won: "Compraron",
    conversion: "Conversión",
    revenue: "Ventas",
    noSource: "Sin fuente",
    noData: "Todavía no hay información en este periodo.",
    closingTitle: "¿Cuánto tardan en cerrar?",
    closingHint: (n: number) =>
      `${n} ${n === 1 ? "venta cerrada" : "ventas cerradas"} en este periodo.`,
    closingFromLead: "Desde que llega el contacto",
    closingFromOpp: "Desde que se abre la oportunidad",
    median: "mediana",
    average: "promedio",
    days: (n: number) =>
      `${n < 10 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n)} ${Math.round(n) === 1 ? "día" : "días"}`,
    lossTitle: "¿Dónde se caen?",
    lossHint: (n: number) =>
      `${n} ${n === 1 ? "oportunidad perdida" : "oportunidades perdidas"} en este periodo.`,
    reasons: "Motivos más comunes",
    noReason: "Sin motivo registrado",
    stages: "Etapa en la que estaban",
    stagesNote: (known: number, total: number) =>
      `Se conoce en ${known} de ${total}; se registra desde que se activó este reporte.`,
    noStage: "Aún no hay datos de etapa.",
  },
  en: {
    title: "What's working?",
    range: {
      "30": "30 days",
      "90": "90 days",
      "365": "1 year",
      all: "All time",
    } as Record<ReportRange, string>,
    sourcesTitle: "Where do the ones who buy come from?",
    sourcesHint: "Contacts that arrived in this period, by source.",
    source: "Source",
    leads: "Contacts",
    won: "Bought",
    conversion: "Conversion",
    revenue: "Sales",
    noSource: "No source",
    noData: "No data in this period yet.",
    closingTitle: "How long do they take to close?",
    closingHint: (n: number) =>
      `${n} ${n === 1 ? "closed sale" : "closed sales"} in this period.`,
    closingFromLead: "From when the contact arrives",
    closingFromOpp: "From when the opportunity opens",
    median: "median",
    average: "average",
    days: (n: number) =>
      `${n < 10 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n)} ${Math.round(n) === 1 ? "day" : "days"}`,
    lossTitle: "Where do they drop off?",
    lossHint: (n: number) =>
      `${n} ${n === 1 ? "lost opportunity" : "lost opportunities"} in this period.`,
    reasons: "Most common reasons",
    noReason: "No reason recorded",
    stages: "Stage they were in",
    stagesNote: (known: number, total: number) =>
      `Known for ${known} of ${total}; recorded since this report was enabled.`,
    noStage: "No stage data yet.",
  },
};

function Bar({
  value,
  max,
  tone = "bg-brand-500",
}: {
  value: number;
  max: number;
  tone?: string;
}) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
      <div
        className={cn("h-full rounded-full", tone)}
        style={{
          width: `${max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0}%`,
        }}
      />
    </div>
  );
}

/** Reportes del CRM que contestan preguntas: de dónde vienen los que compran, cuánto tardan y dónde se caen. */
export function CrmReportSections({
  report,
  lang,
  basePath,
}: {
  report: CrmReport;
  lang: "es" | "en";
  basePath: string;
}) {
  const t = COPY[lang];
  const maxLeads = Math.max(1, ...report.sources.map((s) => s.leads));
  const { closing, losses } = report;
  const maxReason = Math.max(1, ...losses.reasons.map((r) => r.count));
  const maxStage = Math.max(1, ...losses.fromStage.map((r) => r.count));

  return (
    <section className="mb-6" aria-labelledby="crm-report-title">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="crm-report-title"
          className="text-lg font-semibold text-slate-900"
        >
          {t.title}
        </h2>
        <nav
          className="flex gap-1"
          aria-label={lang === "es" ? "Periodo" : "Period"}
        >
          {REPORT_RANGES.map((r) => (
            <Link
              key={r}
              href={`${basePath}?range=${r}`}
              aria-current={report.range === r ? "true" : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-sm font-medium",
                report.range === r
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {t.range[r]}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              {t.sourcesTitle}
            </CardTitle>
            <p className="text-sm text-slate-500">{t.sourcesHint}</p>
          </CardHeader>
          <CardContent>
            {report.sources.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                {t.noData}
              </p>
            ) : (
              <>
                {/* Celular: una tarjeta por fuente, con todos los números a la vista (la tabla se cortaría). */}
                <ul className="divide-y divide-slate-100 sm:hidden">
                  {report.sources.map((s) => (
                    <li key={s.source ?? "—"} className="py-3">
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <p className="font-medium capitalize text-slate-800">
                          {s.source ?? t.noSource}
                        </p>
                        <p className="text-sm font-semibold text-slate-900">
                          {s.revenue.length === 0 ? (
                            <span className="font-normal text-slate-300">
                              —
                            </span>
                          ) : (
                            s.revenue
                              .map((r) => formatCurrency(r.amount, r.currency))
                              .join(" · ")
                          )}
                        </p>
                      </div>
                      <Bar value={s.leads} max={maxLeads} />
                      <p className="mt-1.5 text-sm text-slate-500">
                        {s.leads} {t.leads.toLowerCase()} ·{" "}
                        <span className="font-semibold text-slate-900">
                          {s.won} {t.won.toLowerCase()}
                        </span>{" "}
                        · {Math.round(s.conversion * 100)}%
                      </p>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="pb-2 font-medium">{t.source}</th>
                        <th className="pb-2 text-right font-medium">
                          {t.leads}
                        </th>
                        <th className="pb-2 text-right font-medium">{t.won}</th>
                        <th className="pb-2 text-right font-medium">
                          {t.conversion}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t.revenue}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.sources.map((s) => (
                        <tr
                          key={s.source ?? "—"}
                          className="border-b border-slate-50 last:border-0"
                        >
                          <td className="py-2.5 pr-3">
                            <p className="font-medium capitalize text-slate-800">
                              {s.source ?? t.noSource}
                            </p>
                            <Bar value={s.leads} max={maxLeads} />
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-slate-600">
                            {s.leads}
                          </td>
                          <td className="py-2.5 text-right tabular-nums font-semibold text-slate-900">
                            {s.won}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-slate-600">
                            {Math.round(s.conversion * 100)}%
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-slate-900">
                            {s.revenue.length === 0 ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              s.revenue.map((r) => (
                                <div key={r.currency}>
                                  {formatCurrency(r.amount, r.currency)}
                                </div>
                              ))
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {t.closingTitle}
            </CardTitle>
            <p className="text-sm text-slate-500">
              {t.closingHint(closing.count)}
            </p>
          </CardHeader>
          <CardContent>
            {closing.count === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                {t.noData}
              </p>
            ) : (
              <div className="space-y-5">
                {[
                  {
                    label: t.closingFromLead,
                    median: closing.medianDaysFromLead,
                    avg: closing.avgDaysFromLead,
                  },
                  {
                    label: t.closingFromOpp,
                    median: closing.medianDaysFromOpportunity,
                    avg: closing.avgDaysFromOpportunity,
                  },
                ].map((row) => (
                  <div key={row.label}>
                    <p className="text-sm text-slate-500">{row.label}</p>
                    <p className="text-3xl font-bold tabular-nums text-slate-900">
                      {row.median != null ? t.days(row.median) : "—"}{" "}
                      <span className="text-sm font-normal text-slate-400">
                        ({t.median})
                      </span>
                    </p>
                    {row.avg != null && (
                      <p className="text-sm text-slate-500">
                        {t.average}: {t.days(row.avg)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              {t.lossTitle}
            </CardTitle>
            <p className="text-sm text-slate-500">{t.lossHint(losses.total)}</p>
          </CardHeader>
          <CardContent>
            {losses.total === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                {t.noData}
              </p>
            ) : (
              <div className="space-y-5">
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">
                    {t.reasons}
                  </p>
                  <ul className="space-y-2">
                    {losses.reasons.slice(0, 5).map((r) => (
                      <li key={r.reason ?? "—"}>
                        <div className="mb-1 flex justify-between text-sm">
                          <span
                            className={cn(
                              "truncate",
                              r.reason
                                ? "text-slate-700"
                                : "italic text-slate-400",
                            )}
                          >
                            {r.reason ?? t.noReason}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {r.count}
                          </span>
                        </div>
                        <Bar
                          value={r.count}
                          max={maxReason}
                          tone="bg-red-400"
                        />
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">
                    {t.stages}
                  </p>
                  {losses.fromStage.length === 0 ? (
                    <p className="text-sm text-slate-400">{t.noStage}</p>
                  ) : (
                    <ul className="space-y-2">
                      {losses.fromStage.map((r) => (
                        <li key={r.stage}>
                          <div className="mb-1 flex justify-between text-sm">
                            <span className="text-slate-700">{r.stage}</span>
                            <span className="font-semibold tabular-nums">
                              {r.count}
                            </span>
                          </div>
                          <Bar
                            value={r.count}
                            max={maxStage}
                            tone="bg-amber-400"
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  {losses.fromStageKnown < losses.total && (
                    <p className="mt-2 text-xs text-slate-400">
                      {t.stagesNote(losses.fromStageKnown, losses.total)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
