import { Suspense } from "react";
import { getRealtyContext } from "@/lib/realty/context";
import { loadRotationInputs } from "@/lib/realty/rotation-data";
import { enumLabel } from "@/lib/i18n-realty";
import { num } from "@/lib/loyalty/format";
import { compactPrice, realtyPeriod, type PeriodParams } from "@/lib/realty/page-helpers";
import { DEFAULT_BANDS, bandFor, bandLabel } from "@/lib/realty/constants";
import { GOOD_MATCH } from "@/lib/realty/match";
import {
  ROTATION_DISCLAIMER,
  compareFastSlow,
  rotationOfProperties,
  segmentRotation,
  summarize,
  unmetDemandByZone,
  type SegmentRow,
} from "@/lib/realty/rotation";
import { LoyaltyFilters } from "@/components/loyalty/LoyaltyFilters";
import { Empty, Kpi, SectionCard } from "@/components/realty/RealtyBits";
import { SegmentTable, SpeedBadge, type SegmentLine } from "@/components/realty/RotationBits";

export default async function RotationPage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const ctx = await getRealtyContext();
  const { R } = ctx;
  const sp = await searchParams;
  const period = realtyPeriod({ p: sp.p ?? "month", from: sp.from, to: sp.to }, ctx.org.timezone);
  const { zones, closed, open, unmet } = await loadRotationInputs(ctx.orgId, { from: period.from, to: period.to });

  const zoneName = new Map(zones.map((z) => [z.id, z.name]));
  const sum = summarize(closed, open.length);
  const rows = rotationOfProperties(closed, open);
  const cmp = compareFastSlow(rows);
  const unmetZones = unmetDemandByZone(unmet, GOOD_MATCH);

  const budgetKey = (op: "SALE" | "RENT", price: number) => `${op}:${bandFor(price, DEFAULT_BANDS[op]).key}`;
  const budgetLabel = (key: string) => {
    const [op, band] = key.split(":") as ["SALE" | "RENT", string];
    const b = DEFAULT_BANDS[op].find((x) => x.key === band);
    return `${enumLabel(R, "op", op)} ${b ? bandLabel(b) : band}`;
  };
  const byZone = segmentRotation(closed, open, (c) => c.zoneId, (o) => o.zoneId);
  const byType = segmentRotation(closed, open, (c) => c.propertyType, (o) => o.propertyType);
  const byBudget = segmentRotation(closed, open, (c) => budgetKey(c.operation, c.price), (o) => budgetKey(o.operation, o.price));

  const R2 = R as unknown as Record<string, string>;
  const heads = { segment: R.rotColSegment, closed: R.rotColClosed, open: R.rotColOpen, median: R.rotColMedian, status: R.rotColStatus };
  const lines = (data: SegmentRow[], label: (k: string) => string): SegmentLine[] =>
    data.map((r) => ({ key: r.key, label: label(r.key), closed: r.closed, open: r.open, medianDays: r.medianDays, status: r.status, statusLabel: R2[`sp${r.status}`] }));

  const idx = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  const fmt = (code: string, a: number, b: number) => {
    const isIdx = code.startsWith("PRICE");
    return ((R as unknown as Record<string, string>)[`rotIns${code}`] ?? "").replace("{a}", isIdx ? idx(a) : String(a)).replace("{b}", isIdx ? idx(b) : String(b));
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600">{R.rotIntro}</p>
      <Suspense>
        <LoyaltyFilters period={period.key} fromDay={period.fromDay} toDay={period.toDay} branches={[]} branch="all" />
      </Suspense>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label={R.rotClosed} value={num(sum.closed)} />
        <Kpi label={R.rotMedian} value={sum.medianDays === null ? "—" : String(sum.medianDays)} />
        <Kpi label={R.rotFast} value={num(sum.fast)} />
        <Kpi label={R.rotSlow} value={num(sum.slow)} />
        <Kpi label={R.rotSellThrough} value={sum.sellThroughPct === null ? "—" : `${sum.sellThroughPct}%`} hint={R.rotSellThroughHint} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SegmentTable title={R.rotByZone} rows={lines(byZone, (k) => zoneName.get(k) ?? "—")} heads={heads} empty={R.emptyList} />
        <SegmentTable title={R.rotByType} rows={lines(byType, (k) => enumLabel(R, "type", k))} heads={heads} empty={R.emptyList} />
      </div>
      <SegmentTable title={R.rotByBudget} rows={lines(byBudget, budgetLabel)} heads={heads} empty={R.emptyList} />

      <SectionCard title={R.rotFastSlowTitle}>
        {!cmp.enough ? (
          <Empty>{R.rotNotEnough}</Empty>
        ) : cmp.insights.length === 0 ? (
          <Empty>{R.rotNoDiff}</Empty>
        ) : (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {cmp.insights.map((i) => (
              <li key={i.code}>{fmt(i.code, i.fast, i.slow)}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">{R.rotDisclaimer || ROTATION_DISCLAIMER}</p>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={R.rotProperties}>
          {rows.length === 0 ? (
            <Empty>{R.emptyList}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr><th className="pb-2">{R.title}</th><th className="pb-2 text-right">{R.rotColDays}</th><th className="pb-2 text-right">{R.rotColPriceIdx}</th><th className="pb-2 text-right">{R.rotColInterest}</th><th className="pb-2 text-right">{R.rotColPhotos}</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 font-medium">{r.title} <span className="font-normal text-slate-500">· {zoneName.get(r.zoneId) ?? "—"}</span></td>
                      <td className="py-2 text-right tabular-nums"><SpeedBadge speed={r.speed} label={`${r.days}`} /></td>
                      <td className="py-2 text-right tabular-nums">{idx(r.priceIndex)}</td>
                      <td className="py-2 text-right tabular-nums">{r.interest}</td>
                      <td className="py-2 text-right tabular-nums">{r.photos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
        <SectionCard title={R.rotUnmetTitle} subtitle={R.rotUnmetHint}>
          {unmetZones.length === 0 ? (
            <Empty>{R.emptyList}</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="pb-2">{R.zone}</th><th className="pb-2 text-right">{R.rotColProspects}</th><th className="pb-2 text-right">{R.rotColBudget}</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unmetZones.map((z) => (
                  <tr key={z.zoneId}><td className="py-2 font-medium">{zoneName.get(z.zoneId) ?? "—"}</td><td className="py-2 text-right tabular-nums">{z.count}</td><td className="py-2 text-right tabular-nums">{z.medianBudget === null ? "—" : compactPrice(z.medianBudget)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
