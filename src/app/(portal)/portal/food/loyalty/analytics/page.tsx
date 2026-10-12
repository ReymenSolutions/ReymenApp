import { Suspense } from "react";
import { getLoyaltyContext } from "@/lib/loyalty/context";
import { getLoyaltyAnalytics } from "@/lib/loyalty/queries";
import { resolvePeriod } from "@/lib/loyalty/period";
import { parseBranchParam, MAIN_BRANCH_PARAM } from "@/lib/branches";
import { money, num, pct } from "@/lib/loyalty/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoProgram } from "@/components/loyalty/NoProgram";
import { LoyaltyFilters } from "@/components/loyalty/LoyaltyFilters";
import { ActivityBar, SegmentsList } from "@/components/loyalty/SegmentsPanel";
import { RewardsChart, TrendChart, ZoneBarChart } from "@/components/loyalty/LoyaltyCharts";

function ChartCard({ title, question, children }: { title: string; question: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-slate-500">{question}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

export default async function LoyaltyAnalyticsPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string; branch?: string }> }) {
  const ctx = await getLoyaltyContext();
  const { L, program } = ctx;
  if (!program) return <NoProgram L={L} canManage={ctx.canManage} />;

  const sp = await searchParams;
  const period = resolvePeriod(sp, ctx.org.timezone);
  const branch = parseBranchParam(sp.branch, ctx.branches);
  const a = await getLoyaltyAnalytics({ organizationId: ctx.orgId, programId: program.id, goal: program.rule.visitGoal, period, branch, timezone: ctx.org.timezone });
  const k = a.kpis;
  const series = a.series as unknown as Record<string, number | string>[];

  return (
    <div>
      <Suspense>
        <LoyaltyFilters period={period.key} fromDay={period.fromDay} toDay={period.toDay} branches={ctx.branches} branch={branch === undefined ? "all" : branch === null ? MAIN_BRANCH_PARAM : branch} />
      </Suspense>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={L.kpiNewMembers} value={num(k.newMembers)} hint={`${num(k.totalMembers)} ${L.kpiMembers.toLowerCase()}`} />
        <Stat label={L.kpiVisits} value={num(k.visits)} />
        <Stat label={L.kpiLoyaltySales} value={money(k.loyaltySales)} hint={k.loyaltyShare !== null ? `${pct(k.loyaltyShare)} · ${L.kpiLoyaltyShare.toLowerCase()}` : undefined} />
        <Stat label={L.kpiAvgTicket} value={money(k.avgTicket)} />
        <Stat label={L.recurrence} value={num(k.visitsPerActiveMember, 2)} hint={L.recurrenceHint} />
        <Stat label={L.seriesEarned} value={num(k.rewardsEarned)} hint={L.inPeriod} />
        <Stat label={L.kpiRewardsRedeemed} value={num(k.rewardsRedeemed)} hint={L.inPeriod} />
        <Stat label={L.kpiRedemptionRate} value={pct(k.redemptionRate)} hint={L.allTime} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title={L.chartSignups} question={L.chartSignupsQ}>
          <TrendChart data={series} dataKey="newMembers" name={L.seriesSignups} />
        </ChartCard>
        <ChartCard title={L.chartVisits} question={L.chartVisitsQ}>
          <TrendChart data={series} dataKey="visits" name={L.seriesVisits} />
        </ChartCard>
        <ChartCard title={L.chartSales} question={L.chartSalesQ}>
          <TrendChart data={series} dataKey="sales" name={L.seriesSales} format="money" />
        </ChartCard>
        <ChartCard title={L.chartRewards} question={L.chartRewardsQ}>
          <RewardsChart data={a.series} />
        </ChartCard>
        <ChartCard title={L.chartMembersByZone} question={L.chartMembersByZoneQ}>
          <ZoneBarChart zones={a.zones.zones} metric="members" />
        </ChartCard>
        <ChartCard title={L.chartSalesByZone} question={L.chartSalesByZoneQ}>
          <ZoneBarChart zones={a.zones.zones} metric="sales" />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{L.activityTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityBar segments={a.segments} L={L} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{L.segmentsTitle}</CardTitle>
            <p className="text-xs text-slate-500">{L.segmentsSubtitle}</p>
          </CardHeader>
          <CardContent>
            <SegmentsList segments={a.segments} L={L} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
