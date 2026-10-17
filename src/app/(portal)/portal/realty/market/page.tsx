import Link from "next/link";
import { Suspense } from "react";
import { getRealtyContext } from "@/lib/realty/context";
import { analyze, loadSnapshot } from "@/lib/realty/queries";
import { enumLabel } from "@/lib/i18n-realty";
import { bandLabel } from "@/lib/realty/constants";
import { MIN_SAMPLE } from "@/lib/realty/market";
import { one, realtyPeriod, type PeriodParams } from "@/lib/realty/page-helpers";
import { LoyaltyFilters } from "@/components/loyalty/LoyaltyFilters";
import { BALANCE_FILL, BalanceBadge, Empty, PairBars, SectionCard } from "@/components/realty/RealtyBits";
import { ZoneDemandMapLoader } from "@/components/realty/ZoneDemandMapLoader";
import { cn } from "@/lib/utils";

export default async function MarketPulsePage({ searchParams }: { searchParams: Promise<PeriodParams & { op?: string }> }) {
  const ctx = await getRealtyContext();
  const { R } = ctx;
  const sp = await searchParams;
  const period = realtyPeriod(sp, ctx.org.timezone);
  const op = one(sp.op, ["SALE", "RENT"] as const);
  const snap = await loadSnapshot(ctx.orgId);
  const a = analyze(snap, period);
  const zones = op === "SALE" ? a.zonesSale : op === "RENT" ? a.zonesRent : a.zonesAll;
  const coords = new Map(snap.zones.map((z) => [z.id, z]));
  const mapZones = zones.flatMap((z) => {
    const c = coords.get(z.zoneId);
    if (!c || c.latitude === null || c.longitude === null) return [];
    return [{ id: z.zoneId, name: z.zoneName, lat: c.latitude, lng: c.longitude, demand: z.demand, supply: z.supply, fill: BALANCE_FILL[z.status], statusLabel: enumLabel(R, "bal", z.status) }];
  });
  const qs = (o: string | null) => {
    const p = new URLSearchParams();
    if (sp.p) p.set("p", sp.p);
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    if (o) p.set("op", o);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div>
      <div className="mb-4 rounded-card border border-[#063C82]/20 bg-[#F2F4F6] px-4 py-3 text-sm text-slate-700">
        <strong className="text-[#031738]">{R.observedDemand}.</strong> {R.internalDataNote}
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <Suspense>
          <LoyaltyFilters period={period.key} fromDay={period.fromDay} toDay={period.toDay} branches={[]} branch="all" />
        </Suspense>
        <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label={R.operation}>
          {([[null, R.all], ["SALE", R.opBuySALE], ["RENT", R.opBuyRENT]] as const).map(([k, label]) => (
            <Link key={label} href={`/portal/realty/market${qs(k)}`} aria-current={(op ?? null) === k ? "true" : undefined} className={cn("rounded-md px-3 py-1 text-xs font-medium", (op ?? null) === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <SectionCard title={R.demandMapTitle} subtitle={R.demandMapSubtitle} className="lg:col-span-3">
          {mapZones.length === 0 ? (
            <Empty>{R.noZoneCoords}</Empty>
          ) : (
            <>
              <ZoneDemandMapLoader zones={mapZones} demandLabel={R.demand} supplyLabel={R.supply} recenterLabel={R.recenter} scrollHint={R.scrollHint} />
              <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
                {(["HIGH_DEMAND", "BALANCED", "OVERSUPPLY", "LOW_DATA"] as const).map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: BALANCE_FILL[s] }} />
                    {enumLabel(R, "bal", s)}
                  </span>
                ))}
              </div>
            </>
          )}
        </SectionCard>
        <SectionCard title={R.supplyDemandTitle} subtitle={R.supplyDemandSubtitle} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 font-semibold">{R.zone}</th>
                  <th className="pb-2 pl-3 text-right font-semibold">{R.demand}</th>
                  <th className="pb-2 pl-3 text-right font-semibold">{R.supply}</th>
                  <th className="pb-2 pl-3 text-right font-semibold" title={R.ratio}>{R.ratioShort}</th>
                  <th className="pb-2 pl-2 font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {zones.map((z) => (
                  <tr key={z.zoneId}>
                    <td className="py-2 font-medium text-slate-900">{z.zoneName}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{z.demand}</td>
                    <td className="py-2 pl-3 text-right tabular-nums">{z.supply}</td>
                    <td className="py-2 pl-3 text-right tabular-nums text-slate-600">{z.ratio === null ? "—" : `${z.ratio}×`}</td>
                    <td className="py-2 pl-2 text-right"><BalanceBadge status={z.status} label={enumLabel(R, "bal", z.status)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">{R.ratioShort} = {R.ratio.toLowerCase()} · {R.balLOW_DATA}: &lt; {MIN_SAMPLE}</p>
        </SectionCard>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {(op ? [op] : (["SALE", "RENT"] as const)).map((o) => (
          <SectionCard key={o} title={`${R.budgetTitle} · ${enumLabel(R, "opBuy", o)}`}>
            <PairBars
              demandLabel={R.demand}
              supplyLabel={R.supply}
              rows={(o === "SALE" ? a.bandsSale : a.bandsRent).map((b) => ({ key: b.band.key, label: bandLabel(b.band), demand: b.demand, supply: b.supply, badge: <BalanceBadge status={b.status} label={enumLabel(R, "bal", b.status)} /> }))}
            />
          </SectionCard>
        ))}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <SectionCard title={R.buyVsRent}>
          <ul className="space-y-3">
            {a.split.map((s) => (
              <li key={s.operation}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-slate-800">{enumLabel(R, "opBuy", s.operation)}</span>
                  <span className="tabular-nums text-slate-600">{s.demandPct}% · {s.demand} / {s.supply}</span>
                </div>
                <div className="h-2.5 rounded bg-slate-100">
                  <div className="h-full rounded" style={{ width: `${s.demandPct}%`, backgroundColor: s.operation === "SALE" ? "#031738" : "#063C82" }} />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">{R.demand} / {R.supply}</p>
        </SectionCard>
        <SectionCard title={R.typesTitle}>
          {a.types.length === 0 ? <Empty>{R.emptyList}</Empty> : <PairBars demandLabel={R.demand} supplyLabel={R.supply} rows={a.types.map((t) => ({ key: t.propertyType, label: enumLabel(R, "type", t.propertyType), demand: t.demand, supply: t.supply }))} />}
        </SectionCard>
        <SectionCard title={R.preferencesTitle}>
          {a.preferences.length === 0 ? (
            <Empty>{R.emptyList}</Empty>
          ) : (
            <ul className="space-y-2.5">
              {a.preferences.map((p) => (
                <li key={p.key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-800">{enumLabel(R, "feat", p.key)}</span>
                    <span className="tabular-nums text-slate-600">{p.pct}% · {p.count}</span>
                  </div>
                  <div className="h-2 rounded bg-slate-100"><div className="h-full rounded bg-[#063C82]" style={{ width: `${p.pct}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title={R.emergingTitle} subtitle={R.emergingSubtitle(MIN_SAMPLE)}>
        {a.emerging.length === 0 ? (
          <Empty>{R.emergingEmpty}</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {a.emerging.map((z) => (
              <li key={z.zoneId} className="rounded-lg border border-[#22C55E]/40 bg-emerald-50/50 p-3">
                <p className="text-sm font-semibold text-slate-900">{z.zoneName}</p>
                <p className="text-2xl font-bold text-emerald-700">{z.growthPct === null ? R.growthNew : `+${z.growthPct}%`}</p>
                <p className="text-xs text-slate-600">{z.previous} → {z.current} {R.prospects.toLowerCase()}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
