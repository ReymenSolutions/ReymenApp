import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { getEnabledModules } from "@/lib/modules";
import { getRoiData } from "@/lib/roi";
import { getPlan, planName } from "@/lib/plans";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/shared/MetricCard";
import { LeadTrendChart } from "@/components/charts/LeadTrendChart";
import { LeadFunnelChart } from "@/components/charts/LeadFunnelChart";
import { AutomationHealthChart } from "@/components/charts/AutomationHealthChart";
import { RoiCalculator } from "@/components/portal/RoiCalculator";
import { Users, Zap, Calendar, TrendingUp } from "lucide-react";
import type { PlatformModule } from "@prisma/client";
import { buildLeadTrend } from "@/lib/lead-trend";
import { getCrmReport, parseReportRange } from "@/lib/crm-reports";
import { CrmReportSections } from "@/components/portal/CrmReportSections";

// STATUS_LABELS sourced from server translations at render time

const FUNNEL_COLORS: Record<string, string> = {
  NEW: "#94a3b8", CONTACTED: "#60a5fa", QUALIFIED: "#818cf8",
  PROPOSAL: "#f59e0b", WON: "#10b981", LOST: "#ef4444",
};


async function getReportData(orgId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    leadsByStatus,
    eventsByStatus,
    appointmentsByStatus,
    totalLeads,
    totalAutomationRuns,
    recentLeads,
    confirmedAppointments,
  ] = await Promise.all([
    prisma.lead.groupBy({
      by: ["status"],
      where: { organizationId: orgId, deletedAt: null },
      _count: { id: true },
    }),
    prisma.automationEvent.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: { id: true },
    }),
    prisma.appointment.groupBy({
      by: ["status"],
      where: { organizationId: orgId },
      _count: { id: true },
    }),
    prisma.lead.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.automationEvent.count({ where: { organizationId: orgId } }),
    prisma.lead.findMany({
      where: { organizationId: orgId, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.appointment.count({ where: { organizationId: orgId, status: "CONFIRMED" } }),
  ]);

  return {
    leadsByStatus, eventsByStatus, appointmentsByStatus,
    totalLeads, totalAutomationRuns, recentLeads, confirmedAppointments,
  };
}

export default async function PortalReportsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  const orgId = session.user.organizationId;
  const range = parseReportRange((await searchParams).range);

  const [t, data, enabledModules, org, lang] = await Promise.all([
    getServerT(),
    getReportData(orgId),
    getEnabledModules(orgId),
    prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { plan: true } }),
    getServerLang(),
  ]);
  const roi = await getRoiData(orgId, org.plan);
  const crmReport = enabledModules.includes("CRM") ? await getCrmReport(orgId, range) : null;

  const hasModule = (m: PlatformModule) => enabledModules.includes(m);
  const planLabel = planName(await getPlan(org.plan), lang);

  const wonLeads = data.leadsByStatus.find((l) => l.status === "WON")?._count.id ?? 0;
  const conversionRate = data.totalLeads > 0 ? Math.round((wonLeads / data.totalLeads) * 100) : 0;
  const successEvents = data.eventsByStatus.find((e) => e.status === "SUCCESS")?._count.id ?? 0;
  const failedEvents = data.eventsByStatus.find((e) => e.status === "FAILED")?._count.id ?? 0;
  const pendingEvents = data.eventsByStatus.find((e) => e.status === "PENDING")?._count.id ?? 0;

  const statusLabels: Record<string, string> = {
    NEW: t.funnelNew, CONTACTED: t.funnelContacted, QUALIFIED: t.funnelQualified,
    PROPOSAL: t.funnelProposal, WON: t.funnelWon, LOST: t.funnelLost,
  };

  const trendData = buildLeadTrend(data.recentLeads);
  const funnelData = data.leadsByStatus.map((item) => ({
    label: statusLabels[item.status] ?? item.status,
    count: item._count.id,
    color: FUNNEL_COLORS[item.status] ?? "#94a3b8",
  }));

  return (
    <div>
      <PageHeader title={t.reportsTitle} description={t.reportsDesc} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        {hasModule("CRM") && (
          <>
            <MetricCard title={t.totalLeadsReport} value={data.totalLeads} icon={Users} />
            <MetricCard title={t.wonLeads} value={wonLeads} icon={TrendingUp} iconClassName="bg-emerald-50" />
            <MetricCard title={t.conversion} value={`${conversionRate}%`} icon={Users} iconClassName="bg-brand-50" />
          </>
        )}
        <MetricCard title={t.confirmedAppointments} value={data.confirmedAppointments} icon={Calendar} iconClassName="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        {hasModule("CRM") && (
          <>
            <Card>
              <CardHeader><CardTitle>{t.leadsLast30}</CardTitle></CardHeader>
              <CardContent><LeadTrendChart data={trendData} /></CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>{t.conversionFunnel}</CardTitle></CardHeader>
              <CardContent><LeadFunnelChart data={funnelData} /></CardContent>
            </Card>
          </>
        )}

        {hasModule("AUTOMATIONS") && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                {t.automationHealth}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AutomationHealthChart success={successEvents} failed={failedEvents} pending={pendingEvents} />
            </CardContent>
          </Card>
        )}

      </div>

      {crmReport && <CrmReportSections report={crmReport} lang={lang === "en" ? "en" : "es"} basePath="/portal/reports" />}

      {hasModule("CRM") && <RoiCalculator data={roi} planLabel={planLabel} lang={lang} />}
    </div>
  );
}
