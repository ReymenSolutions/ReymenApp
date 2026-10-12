import { Suspense } from "react";
import { getLoyaltyContext } from "@/lib/loyalty/context";
import { getLoyaltyAnalytics } from "@/lib/loyalty/queries";
import { resolvePeriod } from "@/lib/loyalty/period";
import { parseBranchParam, MAIN_BRANCH_PARAM } from "@/lib/branches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoProgram } from "@/components/loyalty/NoProgram";
import { LoyaltyFilters } from "@/components/loyalty/LoyaltyFilters";
import { InsightsList } from "@/components/loyalty/InsightsList";
import { ZoneMap } from "@/components/loyalty/ZoneMap";
import { ZonesTable } from "@/components/loyalty/LoyaltyCharts";

const ZONE_INSIGHTS = new Set(["leader_zone", "high_value_zone", "low_frequency_zone", "frequency_drop_zone", "opportunity_zone"]);

export default async function LoyaltyMapPage({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string; branch?: string }> }) {
  const ctx = await getLoyaltyContext();
  const { L, program } = ctx;
  if (!program) return <NoProgram L={L} canManage={ctx.canManage} />;

  const sp = await searchParams;
  const period = resolvePeriod(sp, ctx.org.timezone);
  const branch = parseBranchParam(sp.branch, ctx.branches);
  const a = await getLoyaltyAnalytics({ organizationId: ctx.orgId, programId: program.id, goal: program.rule.visitGoal, period, branch, timezone: ctx.org.timezone });

  return (
    <div>
      <Suspense>
        <LoyaltyFilters period={period.key} fromDay={period.fromDay} toDay={period.toDay} branches={ctx.branches} branch={branch === undefined ? "all" : branch === null ? MAIN_BRANCH_PARAM : branch} />
      </Suspense>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">{L.mapTitle}</CardTitle>
          <p className="text-sm text-slate-500">{L.mapSubtitle}</p>
        </CardHeader>
        <CardContent>
          <ZoneMap zones={a.zones.zones} referenceLabel={program.referenceLabel} initialMetric="members" />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{L.zonesTable}</CardTitle>
          </CardHeader>
          <CardContent>
            <ZonesTable zones={a.zones.zones} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{L.insightsTitle}</CardTitle>
            <p className="text-xs text-slate-500">{L.insightsSubtitle}</p>
          </CardHeader>
          <CardContent>
            <InsightsList insights={a.insights.filter((i) => ZONE_INSIGHTS.has(i.kind))} L={L} columns={3} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
