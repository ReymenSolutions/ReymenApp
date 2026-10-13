import { redirect } from "next/navigation";
import Link from "next/link";
import { Bot, Phone, MessageSquare, AlertTriangle, CheckCircle2, Activity } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/shared/MetricCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { AssistantConfigForm } from "@/components/portal/AssistantConfigForm";
import { AgentModesPanel } from "@/components/portal/AgentModesPanel";
import { getAgentModes } from "@/lib/agent-mode";
import { getAgentCap } from "@/lib/agent-cap";
import { isDraftProviderConfigured } from "@/lib/ai-draft";
import { can } from "@/lib/permissions";
import { PortalSectionTabs } from "@/components/portal/PortalSectionTabs";
import { getAiWhatsappTabs } from "@/lib/portal-nav-tabs";
import { formatDate, formatDateTime } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

async function getWhatsAppData(orgId: string) {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [assistant, activeConvs, escalatedConvs, totalConvs, resolvedCount, failedWebhooks24h, lastProcessedWebhook] = await Promise.all([
    prisma.whatsAppAssistant.findUnique({ where: { organizationId: orgId } }),
    prisma.conversation.findMany({
      where: { organizationId: orgId, status: "OPEN", channel: "whatsapp" },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { _count: { select: { messages: true } } },
    }),
    prisma.conversation.count({ where: { organizationId: orgId, status: "ESCALATED" } }),
    prisma.conversation.count({ where: { organizationId: orgId, channel: "whatsapp" } }),
    prisma.conversation.count({ where: { organizationId: orgId, status: "RESOLVED", aiHandled: true } }),
    prisma.webhookEvent.count({ where: { organizationId: orgId, status: "FAILED", createdAt: { gte: since24h } } }),
    prisma.webhookEvent.findFirst({
      where: { organizationId: orgId, status: "PROCESSED" },
      orderBy: { processedAt: "desc" },
      select: { processedAt: true },
    }),
  ]);

  return { assistant, activeConvs, escalatedConvs, totalConvs, resolvedCount, failedWebhooks24h, lastProcessedWebhook };
}

export default async function WhatsAppCenterPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AI_WHATSAPP");

  const [t, lang, { assistant, activeConvs, escalatedConvs, totalConvs, resolvedCount, failedWebhooks24h, lastProcessedWebhook }] =
    await Promise.all([
      getServerT(),
      getServerLang(),
      getWhatsAppData(session.user.organizationId),
    ]);

  const [modes, agentCap] = await Promise.all([getAgentModes(session.user.organizationId), getAgentCap(session.user.organizationId)]);
  const canConfigure = can(session.user.role as UserRole, "knowledge_base:manage");
  const agentActive = Object.values(modes).some((m) => m !== "OFF");

  const resolutionRate =
    totalConvs > 0 ? Math.round((resolvedCount / totalConvs) * 100) : 0;

  return (
    <div>
      <PageHeader
        title={t.whatsappTitle}
        description={t.whatsappDesc}
      />

      <PortalSectionTabs tabs={getAiWhatsappTabs(t, session.user.role as UserRole)} />

      <AgentModesPanel initial={modes} cap={{ cap: agentCap.cap, overBy: agentCap.overBy }} canEdit={canConfigure} aiConfigured={isDraftProviderConfigured()} />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6 lg:grid-cols-4">
        <MetricCard title={t.totalConversations} value={totalConvs} icon={MessageSquare} />
        <MetricCard title={t.activeNow} value={activeConvs.length} icon={Bot} iconClassName="bg-brand-50" />
        <MetricCard title={t.escalated} value={escalatedConvs} icon={AlertTriangle} iconClassName="bg-red-50" />
        <MetricCard title={t.resolvedByAI} value={`${resolutionRate}%`} icon={CheckCircle2} iconClassName="bg-emerald-50" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Config card — spans 2 cols */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50">
                    <Bot className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <CardTitle>{assistant?.name ?? t.aiAssistant}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      {assistant?.phoneNumber && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Phone className="h-3 w-3" />
                          {assistant.phoneNumber}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500">
                    {agentActive ? t.activeStatus : t.pausedStatus}
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <AssistantConfigForm assistant={assistant} />
            </CardContent>
          </Card>
        </div>

        {/* Active conversations panel */}
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-sm">{t.activeConversations}</CardTitle>
            </CardHeader>
            <CardContent>
              {activeConvs.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <MessageSquare className="h-8 w-8 text-slate-200 mb-2" />
                  <p className="text-sm text-slate-400">{t.noActiveConversations}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeConvs.map((conv) => (
                    <Link
                      key={conv.id}
                      href={`/portal/conversations/${conv.id}`}
                      className="block rounded-lg border border-slate-100 p-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {conv.contactName ?? t.unknown}
                          </p>
                          {conv.contactPhone && (
                            <p className="text-xs text-slate-400">{conv.contactPhone}</p>
                          )}
                        </div>
                        <Badge variant="secondary">{conv._count.messages} {t.msgs}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{formatDate(conv.updatedAt, lang)}</p>
                    </Link>
                  ))}
                </div>
              )}

              {escalatedConvs > 0 && (
                <div className="mt-4 rounded-lg bg-red-50 border border-red-100 p-3">
                  <p className="text-sm font-medium text-red-700">
                    {escalatedConvs} {escalatedConvs !== 1 ? t.escalatedConvsPlural : t.escalatedConvs}
                  </p>
                  <Link
                    href="/portal/conversations"
                    className="mt-1 block text-xs text-red-600 hover:underline"
                  >
                    {t.viewAll2}
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Webhook health — lets the client self-diagnose a broken integration without exposing n8n */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="h-4 w-4" />
            {lang === "es" ? "Salud de la integración" : "Integration health"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-4">
            {failedWebhooks24h === 0 ? (
              <Badge variant="success">{lang === "es" ? "Operativo" : "Operational"}</Badge>
            ) : (
              <Badge variant="destructive">
                {lang === "es" ? `${failedWebhooks24h} fallos en 24h` : `${failedWebhooks24h} failures in 24h`}
              </Badge>
            )}
            <span className="text-xs text-slate-500">
              {lastProcessedWebhook?.processedAt
                ? `${lang === "es" ? "Última actividad recibida" : "Last activity received"}: ${formatDateTime(lastProcessedWebhook.processedAt, lang)}`
                : lang === "es"
                ? "Aún no se ha recibido actividad"
                : "No activity received yet"}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
