import { Suspense } from "react";
import { getRealtyContext } from "@/lib/realty/context";
import { getReports } from "@/lib/realty/queries";
import { enumLabel } from "@/lib/i18n-realty";
import { num, shortDate } from "@/lib/loyalty/format";
import { compactPrice, priceText, realtyPeriod, type PeriodParams } from "@/lib/realty/page-helpers";
import { LoyaltyFilters } from "@/components/loyalty/LoyaltyFilters";
import { Empty, Kpi, SectionCard } from "@/components/realty/RealtyBits";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const ctx = await getRealtyContext();
  const { R, lang } = ctx;
  const sp = await searchParams;
  const period = realtyPeriod({ p: sp.p ?? "month", from: sp.from, to: sp.to }, ctx.org.timezone);
  const r = await getReports(ctx.orgId, period);
  const total = r.closings.reduce((a, c) => a + c.finalAmount, 0);
  const commission = r.closings.reduce((a, c) => a + (c.commissionAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <Suspense>
        <LoyaltyFilters period={period.key} fromDay={period.fromDay} toDay={period.toDay} branches={[]} branch="all" />
      </Suspense>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label={R.kpiClosings} value={num(r.closings.length)} />
        <Kpi label={R.amount} value={compactPrice(total)} />
        <Kpi label={R.commission} value={compactPrice(commission)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={R.reportByAdvisor}>
          {r.byAdvisor.length === 0 ? (
            <Empty>{R.emptyList}</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="pb-2">{R.advisor}</th><th className="pb-2 text-right">{R.visits}</th><th className="pb-2 text-right">{R.kpiClosings}</th><th className="pb-2 text-right">{R.amount}</th><th className="pb-2 text-right">{R.commission}</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.byAdvisor.map((a) => (
                  <tr key={a.name}><td className="py-2 font-medium">{a.name}</td><td className="py-2 text-right tabular-nums">{a.visits}</td><td className="py-2 text-right tabular-nums">{a.closings}</td><td className="py-2 text-right tabular-nums">{compactPrice(a.amount)}</td><td className="py-2 text-right tabular-nums">{compactPrice(a.commission)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
        <SectionCard title={R.reportByZone}>
          {r.byZone.length === 0 ? (
            <Empty>{R.emptyList}</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="pb-2">{R.zone}</th><th className="pb-2 text-right">{R.visits}</th><th className="pb-2 text-right">{R.kpiClosings}</th><th className="pb-2 text-right">{R.amount}</th><th className="pb-2 text-right">{R.avgDaysToClose}</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.byZone.map((z) => (
                  <tr key={z.name}><td className="py-2 font-medium">{z.name}</td><td className="py-2 text-right tabular-nums">{z.visits}</td><td className="py-2 text-right tabular-nums">{z.closings}</td><td className="py-2 text-right tabular-nums">{compactPrice(z.amount)}</td><td className="py-2 text-right tabular-nums">{z.avgDaysToClose ?? "—"}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>
      <SectionCard title={R.reportClosings}>
        {r.closings.length === 0 ? (
          <Empty>{R.emptyList}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {r.closings.map((c) => (
              <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-medium text-slate-900">{c.property.title} <span className="font-normal text-slate-500">· {c.property.zone.name} · {enumLabel(R, "op", c.operation)}</span></span>
                <span className="text-slate-600">{priceText(c.finalAmount)} · {c.advisorName} · {shortDate(c.closedAt, lang)}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
