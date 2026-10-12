import { prisma } from "@/lib/prisma";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/shared/MetricCard";
import { AutomationHealthChart } from "@/components/charts/AutomationHealthChart";
import { LeadTrendChart } from "@/components/charts/LeadTrendChart";
import { Users, Zap, TrendingUp, Activity, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { planLabels } from "@/lib/plans";
import { buildLeadTrend } from "@/lib/lead-trend";


async function getGlobalMetrics() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalLeads, totalAutomations, totalClients, totalConversations,
    eventsByStatus, leadsByStatus, clientsByPlan, recentLeads, templateInstallations,
  ] = await Promise.all([
    prisma.lead.count({ where: { deletedAt: null } }),
    prisma.automation.count(),
    prisma.organization.count({ where: { isActive: true } }),
    prisma.conversation.count(),
    prisma.automationEvent.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.lead.groupBy({ by: ["status"], _count: { id: true }, where: { deletedAt: null } }),
    prisma.organization.groupBy({ by: ["plan"], _count: { id: true }, where: { isActive: true } }),
    prisma.lead.findMany({
      where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.templateInstallation.count({ where: { status: "ACTIVE" } }),
  ]);

  return {
    totalLeads, totalAutomations, totalClients, totalConversations,
    eventsByStatus, leadsByStatus, clientsByPlan, recentLeads, templateInstallations,
  };
}

export default async function AdminMetricsPage() {
  const [t, metrics, lang] = await Promise.all([getServerT(), getGlobalMetrics(), getServerLang()]);
  const labelOfPlan = await planLabels(lang);

  const successEvents = metrics.eventsByStatus.find((e) => e.status === "SUCCESS")?._count.id ?? 0;
  const failedEvents = metrics.eventsByStatus.find((e) => e.status === "FAILED")?._count.id ?? 0;
  const pendingEvents = metrics.eventsByStatus.find((e) => e.status === "PENDING")?._count.id ?? 0;
  const totalEvents = metrics.eventsByStatus.reduce((acc, e) => acc + e._count.id, 0);
  const wonLeads = metrics.leadsByStatus.find((l) => l.status === "WON")?._count.id ?? 0;
  const trendData = buildLeadTrend(metrics.recentLeads);

  const statusLabels: Record<string, string> = {
    NEW: t.funnelNew, CONTACTED: t.funnelContacted, QUALIFIED: t.funnelQualified,
    PROPOSAL: t.funnelProposal, WON: t.funnelWon, LOST: t.funnelLost,
  };

  return (
    <div>
      <PageHeader title={t.adminMetricsTitle} description={t.adminMetricsDesc} />

      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        <MetricCard title={t.adminActiveClients} value={metrics.totalClients} icon={Users} iconClassName="bg-blue-50" />
        <MetricCard title={t.totalLeads} value={metrics.totalLeads} icon={TrendingUp} iconClassName="bg-brand-50" />
        <MetricCard title={t.automations} value={metrics.totalAutomations} icon={Zap} />
        <MetricCard title={t.conversations} value={metrics.totalConversations} icon={Activity} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader><CardTitle>{t.adminGlobalLeadsTrend}</CardTitle></CardHeader>
          <CardContent><LeadTrendChart data={trendData} /></CardContent>
        </Card>

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
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>{t.adminLeadsByStatusGlobal}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.leadsByStatus.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">{t.noData}</p>
              ) : (
                metrics.leadsByStatus
                  .sort((a, b) => b._count.id - a._count.id)
                  .map((item) => (
                    <div key={item.status} className="flex justify-between text-sm">
                      <span className="text-slate-600">{statusLabels[item.status] ?? item.status}</span>
                      <span className="font-semibold">{item._count.id}</span>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              {t.adminClientsByPlan}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {metrics.clientsByPlan.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">{t.noData}</p>
              ) : (
                metrics.clientsByPlan
                  .sort((a, b) => b._count.id - a._count.id)
                  .map((item) => (
                    <div key={item.plan} className="flex items-center justify-between text-sm">
                      <Badge variant="secondary" className="capitalize">
                        {labelOfPlan[item.plan] ?? item.plan}
                      </Badge>
                      <span className="font-semibold">{item._count.id} {t.adminClientsUnit}</span>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t.adminEventsSummary}</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: t.adminTotalEvents, value: totalEvents, color: "text-slate-900" },
                { label: t.adminSuccessful, value: successEvents, color: "text-emerald-600" },
                { label: t.adminFailed, value: failedEvents, color: "text-red-500" },
                { label: t.adminTemplatesInstalled, value: metrics.templateInstallations, color: "text-brand-600" },
                { label: t.wonLeads, value: wonLeads, color: "text-emerald-600" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className={`font-bold ${color}`}>{value.toLocaleString("en-US")}</span>
                </div>
              ))}
              {totalEvents > 0 && (
                <div className="mt-2">
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="bg-emerald-500" style={{ width: `${(successEvents / totalEvents) * 100}%` }} />
                    <div className="bg-red-400" style={{ width: `${(failedEvents / totalEvents) * 100}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {Math.round((successEvents / totalEvents) * 100)}% {t.adminSuccessRate}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
