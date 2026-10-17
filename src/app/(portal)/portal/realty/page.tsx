import Link from "next/link";
import { Suspense } from "react";
import { CalendarClock, ChevronRight } from "lucide-react";
import { getRealtyContext } from "@/lib/realty/context";
import { analyze, getDashboardCounts, getTodayInputs, listUpcomingVisits, loadSnapshot } from "@/lib/realty/queries";
import { buildToday } from "@/lib/realty/today";
import { analyzeCampaigns } from "@/lib/realty/campaigns";
import { trendPct } from "@/lib/loyalty/period";
import { bandLabel } from "@/lib/realty/constants";
import { enumLabel } from "@/lib/i18n-realty";
import { dateTime, num } from "@/lib/loyalty/format";
import { compactPrice, priceText, realtyPeriod, type PeriodParams } from "@/lib/realty/page-helpers";
import { LoyaltyFilters } from "@/components/loyalty/LoyaltyFilters";
import { BalanceBadge, Empty, Kpi, PairBars, ScorePill, SectionCard, StatusBadge, Thumb } from "@/components/realty/RealtyBits";
import { cn } from "@/lib/utils";

export default async function RealtyOverviewPage({ searchParams }: { searchParams: Promise<PeriodParams> }) {
  const ctx = await getRealtyContext();
  const { R, lang } = ctx;
  const sp = await searchParams;
  const period = realtyPeriod(sp, ctx.org.timezone);
  const now = new Date();
  const [snap, counts, upcoming, todayIn] = await Promise.all([
    loadSnapshot(ctx.orgId, now),
    getDashboardCounts(ctx.orgId, period),
    listUpcomingVisits(ctx.orgId, now),
    getTodayInputs(ctx.orgId, now),
  ]);
  const a = analyze(snap, period);
  const available = snap.properties.filter((p) => p.status === "AVAILABLE").length;
  const pipeline = snap.properties.filter((p) => p.status === "RESERVED" || p.status === "NEGOTIATION").length;

  const campaignReads = analyzeCampaigns(todayIn.campaigns);
  const recs = buildToday({
    now,
    lang,
    highMatches: todayIn.highMatches,
    upcomingVisits: upcoming.map((v) => ({ appointmentId: v.appointment.id, propertyTitle: v.property.title, profileName: v.profile?.lead?.name ?? R.prospect, startsAt: v.appointment.startTime, confirmed: v.appointment.status === "CONFIRMED" })),
    stagnant: a.stagnant.slice(0, 3).map((p) => ({ propertyId: p.id, title: p.title, days: a.scores.get(p.id)!.facts.days, points: a.scores.get(p.id)!.facts.points })),
    boost: a.boost.slice(0, 2).map((p) => ({ propertyId: p.id, title: p.title, score: a.scores.get(p.id)!.total, demand: a.scores.get(p.id)!.facts.demand })),
    sourcing: a.sourcing.slice(0, 3).map((s) => ({ ...s, bandLabel: bandLabel(s.band) })),
    deficientCampaigns: todayIn.campaigns.flatMap((c, i) => {
      const read = campaignReads[i];
      if (read.rating !== "DEFICIENT") return [];
      return [{ id: c.id, name: c.name, spend: compactPrice(c.spend), leads: c.leadsCount, cpl: read.metrics.cpl === null ? null : compactPrice(read.metrics.cpl) }];
    }),
    unmatchedProfiles: todayIn.unmatched.slice(0, 3),
    typeLabel: (t) => enumLabel(R, "type", t),
    operationLabel: (o) => enumLabel(R, "op", o),
  });

  const featured = [...a.boost, ...snap.properties.filter((p) => p.status === "AVAILABLE" && !a.boost.includes(p))]
    .filter((p) => a.scores.has(p.id))
    .sort((x, y) => a.scores.get(y.id)!.total - a.scores.get(x.id)!.total)
    .slice(0, 4);
  const zoneName = new Map(snap.zones.map((z) => [z.id, z.name]));
  const topZones = a.zonesAll.filter((z) => z.demand + z.supply > 0).slice(0, 6);
  const funnel = counts.funnel;
  const funnelLabels = [R.funnelNew, R.funnelMatch, R.funnelVisit, R.funnelClosed];
  const sale = a.split.find((s) => s.operation === "SALE")!;
  const topBand = [...a.bandsSale].sort((x, y) => y.demand - x.demand)[0];

  return (
    <div>
      <Suspense>
        <LoyaltyFilters period={period.key} fromDay={period.fromDay} toDay={period.toDay} branches={[]} branch="all" />
      </Suspense>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label={R.kpiActiveProspects} value={num(counts.activeProfiles)} hint={R.newInPeriod(counts.newProfiles)} trend={trendPct(counts.newProfiles, counts.newProfilesPrev)} trendLabel={R.vsPrev} />
        <Kpi label={R.kpiAvailable} value={num(available)} hint={R.inNegotiation(pipeline)} />
        <Kpi label={R.kpiHighMatches} value={num(counts.highMatches)} hint={R.highMatchHint} />
        <Kpi label={R.kpiVisits} value={num(counts.visits)} trend={trendPct(counts.visits, counts.visitsPrev)} trendLabel={R.vsPrev} />
        <Kpi label={R.kpiClosings} value={num(counts.closings)} hint={R.closedAmount(compactPrice(counts.closedAmount))} trend={trendPct(counts.closings, counts.closingsPrev)} trendLabel={R.vsPrev} />
        <Kpi label={R.kpiInterest} value={num(counts.contacts)} hint={R.viewsHint(num(counts.views))} trend={trendPct(counts.contacts, counts.contactsPrev)} trendLabel={R.vsPrev} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title={R.todayTitle} subtitle={R.todaySubtitle} className="lg:col-span-2">
          {recs.length === 0 ? (
            <Empty>{R.todayEmpty}</Empty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recs.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", r.priority === "HIGH" ? "bg-red-500" : r.priority === "MEDIUM" ? "bg-amber-500" : "bg-slate-300")} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                    <p className="text-xs text-slate-500">{r.explanation}</p>
                    <p className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{enumLabel(R, "prio", r.priority)}</span>
                      {r.evidence.map((e) => (
                        <span key={e} className="rounded bg-[#F2F4F6] px-1.5 py-0.5 text-[11px] text-slate-700">{e}</span>
                      ))}
                    </p>
                  </div>
                  <Link href={r.href} className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[#063C82] hover:underline">
                    {r.actionLabel}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={R.funnelTitle} subtitle={R.funnelSubtitle}>
          <ol className="space-y-3">
            {funnel.map((n, i) => {
              const pct = funnel[0] ? Math.round((n / funnel[0]) * 100) : 0;
              return (
                <li key={funnelLabels[i]}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="text-slate-700">{funnelLabels[i]}</span>
                    <span className="font-semibold tabular-nums text-slate-900">
                      {num(n)} {i > 0 && <span className="text-xs font-normal text-slate-500">({pct}%)</span>}
                    </span>
                  </div>
                  <div className="h-3 rounded bg-slate-100">
                    <div className="h-full rounded" style={{ width: `${funnel[0] ? Math.max(n > 0 ? 3 : 0, (n / funnel[0]) * 100) : 0}%`, backgroundColor: ["#031738", "#04275A", "#063C82", "#22C55E"][i] }} />
                  </div>
                </li>
              );
            })}
          </ol>
        </SectionCard>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title={R.supplyDemandTitle} subtitle={R.supplyDemandSubtitle} action={{ href: "/portal/realty/market", label: R.tabMarket }}>
          {topZones.length === 0 ? (
            <Empty>{R.emptyList}</Empty>
          ) : (
            <PairBars
              demandLabel={R.demand}
              supplyLabel={R.supply}
              rows={topZones.map((z) => ({ key: z.zoneId, label: z.zoneName, demand: z.demand, supply: z.supply, badge: <BalanceBadge status={z.status} label={enumLabel(R, "bal", z.status)} /> }))}
            />
          )}
        </SectionCard>

        <SectionCard title={R.pulseTitle} subtitle={R.pulseSubtitle} action={{ href: "/portal/realty/market", label: R.seeAll }}>
          <p className="mb-4 rounded-md bg-[#F2F4F6] px-3 py-2 text-xs text-slate-600">
            <strong className="text-[#031738]">{R.observedDemand}.</strong> {R.internalDataNote}
          </p>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-slate-500">{R.buyVsRent}</dt>
              <dd className="mt-1 font-semibold text-slate-900">
                {sale.demandPct}% {R.opBuySALE} · {100 - sale.demandPct}% {R.opBuyRENT}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{R.budgetTitle}</dt>
              <dd className="mt-1 font-semibold text-slate-900">{topBand && topBand.demand > 0 ? `${bandLabel(topBand.band)} · ${topBand.demand} ${R.prospects.toLowerCase()}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{R.emergingTitle}</dt>
              <dd className="mt-1 font-semibold text-slate-900">{a.emerging[0] ? `${a.emerging[0].zoneName} (${a.emerging[0].growthPct === null ? R.growthNew : `+${a.emerging[0].growthPct}%`})` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{R.preferencesTitle}</dt>
              <dd className="mt-1 font-semibold text-slate-900">{a.preferences.slice(0, 2).map((p) => `${enumLabel(R, "feat", p.key)} ${p.pct}%`).join(" · ") || "—"}</dd>
            </div>
          </dl>
        </SectionCard>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title={R.featuredTitle} subtitle={R.featuredSubtitle} action={{ href: "/portal/realty/properties", label: R.seeAll }} className="lg:col-span-2">
          {featured.length === 0 ? (
            <Empty>{R.propertiesEmpty}</Empty>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {featured.map((p) => {
                const s = a.scores.get(p.id)!;
                return (
                  <li key={p.id}>
                    <Link href={`/portal/realty/properties/${p.id}`} className="flex gap-3 rounded-lg border border-slate-200 p-2 transition-colors hover:border-[#063C82]">
                      <Thumb mediaId={p.coverId} alt={p.title} className="h-20 w-24 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{p.title}</p>
                        <p className="truncate text-xs text-slate-500">{zoneName.get(p.zoneId)} · {enumLabel(R, "type", p.propertyType)}</p>
                        <p className="mt-1 text-sm font-bold text-[#031738] dark:text-white">{priceText(p.price, p.currency)}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <StatusBadge status={p.status} label={enumLabel(R, "st", p.status)} />
                          <ScorePill value={s.total} title={R.opportunityScore} />
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={R.upcomingTitle} action={{ href: "/portal/realty/visits", label: R.seeAll }}>
          {upcoming.length === 0 ? (
            <Empty>{R.upcomingEmpty}</Empty>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((v) => (
                <li key={v.id} className="flex items-start gap-2.5">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[#063C82]" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{v.property.title}</p>
                    <p className="text-xs text-slate-500">
                      {dateTime(v.appointment.startTime, lang, ctx.org.timezone)} · {v.profile?.lead?.name ?? "—"} · {enumLabel(R, "ap", v.appointment.status)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
