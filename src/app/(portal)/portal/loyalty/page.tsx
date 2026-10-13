import Link from "next/link";
import { Suspense } from "react";
import { Users, ScanLine, DollarSign, Receipt, Gift, PieChart } from "lucide-react";
import { getLoyaltyContext } from "@/lib/loyalty/context";
import { getLoyaltyAnalytics, listRecentMembers } from "@/lib/loyalty/queries";
import { resolvePeriod } from "@/lib/loyalty/period";
import { parseBranchParam, MAIN_BRANCH_PARAM } from "@/lib/branches";
import { money, num, pct, relativeDay } from "@/lib/loyalty/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiTile } from "@/components/loyalty/KpiTile";
import { NoProgram } from "@/components/loyalty/NoProgram";
import { LoyaltyFilters } from "@/components/loyalty/LoyaltyFilters";
import { InsightsList } from "@/components/loyalty/InsightsList";
import { ActivityBar } from "@/components/loyalty/SegmentsPanel";
import { ZoneMap } from "@/components/loyalty/ZoneMap";
import { TrendChart } from "@/components/loyalty/LoyaltyCharts";

export default async function LoyaltyOverviewPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string; branch?: string }> }) {
  const ctx = await getLoyaltyContext();
  const { L, program, lang } = ctx;
  if (!program) return <NoProgram L={L} canManage={ctx.canManage} />;

  const sp = await searchParams;
  const period = resolvePeriod(sp, ctx.org.timezone);
  const branch = parseBranchParam(sp.branch, ctx.branches);
  const [a, recent] = await Promise.all([
    getLoyaltyAnalytics({ organizationId: ctx.orgId, programId: program.id, goal: program.rule.visitGoal, period, branch, timezone: ctx.org.timezone }),
    listRecentMembers(ctx.orgId, program.id, branch, program.rule.visitGoal, 6),
  ]);
  const k = a.kpis;
  const topZones = a.zones.zones.slice(0, 5);

  return (
    <div>
      <Suspense>
        <LoyaltyFilters
          period={period.key}
          fromDay={period.fromDay}
          toDay={period.toDay}
          branches={ctx.branches}
          branch={branch === undefined ? "all" : branch === null ? MAIN_BRANCH_PARAM : branch}
        />
      </Suspense>

      {/* ── KPIs ── */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile icon={Users} label={L.kpiMembers} value={num(k.totalMembers)} hint={`+${num(k.newMembers)} ${L.inPeriod}`} trendPct={k.newMembersTrend} />
        <KpiTile icon={ScanLine} label={L.kpiVisits} value={num(k.visits)} trendPct={k.visitsTrend} trendLabel={L.vsPrev} accent="orange" />
        <KpiTile icon={DollarSign} label={L.kpiLoyaltySales} value={money(k.loyaltySales)} trendPct={k.loyaltySalesTrend} trendLabel={L.vsPrev} accent="orange" />
        <KpiTile icon={Receipt} label={L.kpiAvgTicket} value={money(k.avgTicket)} trendPct={k.avgTicketTrend} trendLabel={L.vsPrev} />
        <KpiTile
          icon={Gift}
          label={`${L.kpiRewards} · ${L.kpiRewardsAvailable}`}
          value={num(k.rewardsAvailable)}
          hint={L.redeemedInPeriod(k.rewardsRedeemed)}
          accent="emerald"
        />
        <KpiTile
          icon={PieChart}
          label={L.kpiLoyaltyShare}
          value={pct(k.loyaltyShare)}
          hint={k.restaurantSales > 0 ? L.shareOfSales(money(k.loyaltySales), money(k.restaurantSales)) : L.noRestaurantSales}
        />
      </div>

      {/* ── Mapa + oportunidades ── */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{L.mapCardTitle}</CardTitle>
            <Link href="/portal/loyalty/map" className="text-xs font-medium text-brand-600 hover:underline">{L.openMap}</Link>
          </CardHeader>
          <CardContent>
            <ZoneMap zones={a.zones.zones} referenceLabel={program.referenceLabel} referenceLat={program.referenceLat} referenceLng={program.referenceLng} compact initialMetric="sales" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{L.insightsTitle}</CardTitle>
            <p className="text-xs text-slate-500">{L.insightsSubtitle}</p>
          </CardHeader>
          <CardContent>
            <InsightsList insights={a.insights} L={L} limit={6} />
          </CardContent>
        </Card>
      </div>

      {/* ── Evolución + actividad ── */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{L.chartVisits}</CardTitle>
              <p className="mt-1 text-xs text-slate-500">{L.chartVisitsQ}</p>
            </div>
            <Link href="/portal/loyalty/analytics" className="text-xs font-medium text-brand-600 hover:underline">{L.seeAnalytics}</Link>
          </CardHeader>
          <CardContent>
            <TrendChart data={a.series as unknown as Record<string, number | string>[]} dataKey="visits" name={L.seriesVisits} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{L.activityTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityBar segments={a.segments} L={L} />
          </CardContent>
        </Card>
      </div>

      {/* ── Fila inferior ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{L.recentMembers}</CardTitle>
            <Link href="/portal/loyalty/members?sort=newest" className="text-xs font-medium text-brand-600 hover:underline">{L.seeAll}</Link>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-slate-500">{L.noMembersYet}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recent.map((m) => (
                  <li key={m.id}>
                    <Link href={`/portal/loyalty/members/${m.id}`} className="flex items-center gap-3 px-6 py-2.5 hover:bg-slate-50">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                        {m.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{m.name}</span>
                        <span className="block text-xs text-slate-500">CP {m.postalCode} · {L.enrolled(relativeDay(m.createdAt, lang))}</span>
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-slate-600">{m.progress.current}/{m.progress.goal}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{L.topZones}</CardTitle>
            <Link href="/portal/loyalty/map" className="text-xs font-medium text-brand-600 hover:underline">{L.openMap}</Link>
          </CardHeader>
          <CardContent>
            {topZones.length === 0 ? (
              <p className="text-sm text-slate-500">{L.noDataPeriod}</p>
            ) : (
              <ul className="space-y-3">
                {topZones.map((z) => (
                  <li key={z.postalCode}>
                    <div className="flex items-baseline justify-between text-sm">
                      <Link href={`/portal/loyalty/members?cp=${z.postalCode}`} className="font-semibold text-slate-900 hover:text-brand-600">CP {z.postalCode}</Link>
                      <span className="tabular-nums text-slate-900">{money(z.sales)} <span className="text-xs text-slate-500">· {pct(z.salesShare)}</span></span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${Math.max(2, z.salesShare)}%` }} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{num(z.members)} {L.detailMembers.toLowerCase()} · {L.detailTicket.toLowerCase()} {money(z.avgTicket)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{L.rewardsCard}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-2xl font-bold tabular-nums text-emerald-700">{num(k.rewardsAvailable)}</p>
                <p className="text-[11px] font-medium text-emerald-700">{L.kpiRewardsAvailable}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-2xl font-bold tabular-nums text-slate-900">{num(k.rewardsEarned)}</p>
                <p className="text-[11px] font-medium text-slate-500">{L.seriesEarned}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-2xl font-bold tabular-nums text-slate-900">{num(k.rewardsRedeemed)}</p>
                <p className="text-[11px] font-medium text-slate-500">{L.kpiRewardsRedeemed}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 text-sm">
              <span className="text-slate-600">{L.kpiRedemptionRate} <span className="text-xs text-slate-400">({L.allTime})</span></span>
              <span className="font-bold tabular-nums text-slate-900">{pct(k.redemptionRate)}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {program.rule.visitGoal} {L.kpiVisits.toLowerCase()} → {program.rule.rewardName}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
