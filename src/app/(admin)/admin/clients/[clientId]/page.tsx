import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Zap, Users, FileText, Layers, AlertTriangle, CheckCircle2, Bot, MessageSquare, SlidersHorizontal, BookOpen, BarChart3 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getRulebook, rulebookProgress } from "@/lib/rulebook";
import { getServerT } from "@/lib/i18n-server";
import { getEnabledModules } from "@/lib/modules";
import { METRIC_KEYS, monthPeriod } from "@/lib/metrics";
import { PLAN_LIMITS, PLAN_MODULES, getMonthlyPlanPriceMxn, isUnlimited } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ChangePlanDialog } from "@/components/admin/ChangePlanDialog";
import { ToggleClientStatusButton } from "@/components/admin/ToggleClientStatusButton";
import { OrgWebhookInfoDialog } from "@/components/admin/OrgWebhookInfoDialog";
import { ClientAutomationsHub } from "@/components/admin/ClientAutomationsHub";
import { getOrganizationBlueprints } from "@/actions/admin/blueprints";
import { OrganizationModulesPanel } from "@/components/admin/OrganizationModulesPanel";
import { PurgePosSalesPanel } from "@/components/admin/PurgePosSalesPanel";
import { SmartcardLinkPanel } from "@/components/admin/SmartcardLinkPanel";
import { getSmartcardLinkState, planMemberLimit } from "@/lib/smartcard-link";
import { AdminClientUsersPanel } from "@/components/admin/AdminClientUsersPanel";
import { ConsumptionChart } from "@/components/charts/ConsumptionChart";
import { getOrganizationModules } from "@/actions/admin/modules";
import { TemplateConfigButton } from "@/components/admin/TemplateConfigButton";
import { AiBudgetPanel } from "@/components/admin/AiBudgetPanel";
import { getOrgAiBudget } from "@/actions/admin/ai-budget";
import { listProviders } from "@/lib/ai/providers";
import { formatDate } from "@/lib/utils";
import type { PlatformModule } from "@prisma/client";

const CONSUMPTION_MONTHS = 6;

function lastNPeriods(n: number): string[] {
  const periods: string[] = [];
  const cursor = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(cursor.getUTCFullYear(), cursor.getUTCMonth() - i, 1);
    periods.push(monthPeriod(d));
  }
  return periods;
}

async function getConsumption(clientId: string) {
  const periods = lastNPeriods(CONSUMPTION_MONTHS);
  const rows = await prisma.metric.findMany({
    where: { organizationId: clientId, period: { in: periods } },
    select: { key: true, period: true, value: true },
  });

  return periods.map((period) => {
    const forPeriod = rows.filter((r) => r.period === period);
    const sum = (key: string) => forPeriod.filter((r) => r.key === key).reduce((acc, r) => acc + r.value, 0);
    return {
      period,
      leads: sum(METRIC_KEYS.LEADS_CAPTURED),
      messages: sum(METRIC_KEYS.MESSAGES_SENT) + sum(METRIC_KEYS.MESSAGES_RECEIVED),
      automations: sum(METRIC_KEYS.AUTOMATION_EXECUTIONS),
    };
  });
}

async function getClientDetail(clientId: string) {
  const [client, escalatedConversations, openRequestsCount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: clientId },
      include: {
        users: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        automations: {
          include: { events: { take: 5, orderBy: { createdAt: "desc" } } },
          orderBy: { createdAt: "desc" },
        },
        leads: {
          take: 10,
          orderBy: { createdAt: "desc" },
          where: { deletedAt: null },
        },
        requests: { take: 5, orderBy: { createdAt: "desc" } },
        templateInstallations: {
          include: {
            template: { select: { id: true, name: true, iconEmoji: true, industry: true } },
            version: { select: { version: true, configSpec: true } },
          },
          orderBy: { installedAt: "desc" },
        },
        whatsappAssistant: true,
        _count: { select: { leads: true, automations: true, conversations: true, knowledgeBase: true } },
      },
    }),
    prisma.conversation.count({ where: { organizationId: clientId, status: "ESCALATED" } }),
    prisma.request.count({ where: { organizationId: clientId, status: "OPEN" } }),
  ]);

  return { client, escalatedConversations, openRequestsCount };
}

export default async function ClientDetailPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const [t, { client, escalatedConversations, openRequestsCount }, moduleEntitlements, enabledModules, consumption, blueprints] = await Promise.all([
    getServerT(),
    getClientDetail(clientId),
    getOrganizationModules(clientId),
    getEnabledModules(clientId),
    getConsumption(clientId),
    getOrganizationBlueprints(clientId),
  ]);
  if (!client) notFound();
  const aiBudget = await getOrgAiBudget({ orgId: clientId });
  // Plantillas instaladas cuya versión declara parámetros: tienen pantalla de configuración.
  const configurableAutomationIds = new Set(client.templateInstallations.filter((i) => i.status === "ACTIVE" && i.automationId && i.version.configSpec).map((i) => i.automationId as string));

  const { filled: rulebookFilled, total: rulebookTotal } = rulebookProgress(await getRulebook(clientId));
  const planInfo = PLAN_LIMITS[client.plan] ?? PLAN_LIMITS.starter;
  const leadsLimit = planInfo.leads;
  const planModules = PLAN_MODULES[client.plan] ?? PLAN_MODULES.starter;

  const hasModule = (m: PlatformModule) => enabledModules.includes(m);
  const automationErrors = client.automations.filter((a) => a.status === "ERROR").length;

  // Scoped to this one client — the admin dashboard already covers the
  // platform-wide equivalent of this. Only modules this org actually has
  // enabled contribute an item; a disabled module's data (e.g. an org that
  // never had AI_WHATSAPP) never shows up here as something to "fix".
  const needsAttention: { label: string; count: number }[] = [];
  if (hasModule("AUTOMATIONS") && automationErrors > 0) {
    needsAttention.push({ label: t.adminAutomationErrorsNote, count: automationErrors });
  }
  if (hasModule("AI_WHATSAPP") && escalatedConversations > 0) {
    needsAttention.push({ label: t.adminEscalatedNote, count: escalatedConversations });
  }
  if (openRequestsCount > 0) {
    needsAttention.push({ label: t.adminOpenRequestsNote, count: openRequestsCount });
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/admin/clients" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {t.adminBackToClients}
        </Link>
      </div>

      <PageHeader
        title={client.name}
        description={`${client.slug} · ${client.industry ?? t.adminNoIndustry} · ${planInfo.label} $${getMonthlyPlanPriceMxn(client.plan, client.customMonthlyPriceMxn !== null ? Number(client.customMonthlyPriceMxn) : null).toLocaleString("en-US")} MXN`}
        actions={
          <div className="flex items-center gap-2">
            <OrgWebhookInfoDialog
              orgId={client.id}
              secret={client.n8nWebhookSecret}
              foodPosReadKey={client.foodPosReadKey}
              showFoodPosKey={hasModule("FOOD_OPS")}
            />
            <ChangePlanDialog
              orgId={client.id}
              currentPlan={client.plan}
              currentCustomPrice={client.customMonthlyPriceMxn !== null ? Number(client.customMonthlyPriceMxn) : null}
            />
            <ToggleClientStatusButton orgId={client.id} isActive={client.isActive} />
            <Badge variant={client.isActive ? "success" : "destructive"}>
              {client.isActive ? t.statusActive : t.inactive}
            </Badge>
          </div>
        }
      />

      <Card className={`mb-6 ${needsAttention.length > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <CardContent className="p-4">
          {needsAttention.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                {t.adminNeedsAttention}
              </div>
              {needsAttention.map((item) => (
                <span key={item.label} className="text-sm text-amber-700">
                  <strong>{item.count}</strong> {item.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              {t.adminAllClear}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 mb-6 sm:grid-cols-3">
        {hasModule("CRM") && (
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{client._count.leads}</p>
              <p className="text-xs text-slate-500 mt-1">{t.totalLeads}</p>
              <p className={`text-xs mt-0.5 ${client._count.leads >= leadsLimit ? "text-red-500 font-medium" : "text-slate-400"}`}>
                {client._count.leads} / {isUnlimited(leadsLimit) ? "∞" : leadsLimit} ({t.plan})
              </p>
            </CardContent>
          </Card>
        )}
        {hasModule("AUTOMATIONS") && (
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{client._count.automations}</p>
              <p className="text-xs text-slate-500 mt-1">{t.automations}</p>
            </CardContent>
          </Card>
        )}
        {hasModule("AI_WHATSAPP") && (
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{client._count.conversations}</p>
              <p className="text-xs text-slate-500 mt-1">{t.conversations}</p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {hasModule("CRM") && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t.recentLeads}</CardTitle>
              <Users className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {client.leads.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">{t.adminNoLeadsShort}</p>
              ) : (
                <div className="space-y-3">
                  {client.leads.map((lead) => (
                    <div key={lead.id} className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{lead.name}</p>
                        <p className="text-xs text-slate-400">{lead.source ?? "manual"} · {formatDate(lead.createdAt)}</p>
                      </div>
                      <StatusBadge status={lead.status} />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {hasModule("AI_WHATSAPP") && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t.adminWhatsAppOperations}</CardTitle>
              <Bot className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <Bot className="h-3.5 w-3.5 text-slate-400" />
                  {client.whatsappAssistant ? t.adminAssistantConfigured : t.adminAssistantNotConfigured}
                </span>
                {client.whatsappAssistant && (
                  <Badge variant={client.whatsappAssistant.isActive ? "success" : "secondary"}>
                    {client.whatsappAssistant.isActive ? t.activeStatus : t.pausedStatus}
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                  {t.adminEscalatedConversations}
                </span>
                <Badge variant={escalatedConversations > 0 ? "destructive" : "secondary"}>{escalatedConversations}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
                  {t.adminPromptsConfigured}
                </span>
                <span className="text-sm text-slate-500">{rulebookFilled}/{rulebookTotal}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-slate-700">
                  <BookOpen className="h-3.5 w-3.5 text-slate-400" />
                  {t.adminKbArticlesCount}
                </span>
                <span className="text-sm text-slate-500">{client._count.knowledgeBase}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <AdminClientUsersPanel orgId={client.id} users={client.users} />

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t.adminRecentRequests}</CardTitle>
            <FileText className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            {client.requests.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">{t.adminNoRequestsShort}</p>
            ) : (
              <div className="space-y-3">
                {client.requests.map((req) => (
                  <div key={req.id} className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{req.title}</p>
                      <p className="text-xs text-slate-400">{formatDate(req.createdAt)}</p>
                    </div>
                    <StatusBadge status={req.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <OrganizationModulesPanel
          orgId={client.id}
          modules={moduleEntitlements}
          planLabel={planInfo.label}
          planModules={planModules}
        />

        <ClientAutomationsHub
          orgId={client.id}
          blueprints={blueprints}
          legacy={client.automations
            .filter((a) => !a.blueprintKey)
            .map((a) => ({ id: a.id, name: a.name, type: a.type, status: a.status, n8nWorkflowId: a.n8nWorkflowId, lastRunAt: a.lastRunAt?.toISOString() ?? null, configurable: configurableAutomationIds.has(a.id) }))}
        />

        {hasModule("FOOD_OPS") && <PurgePosSalesPanel orgId={client.id} />}

        {hasModule("NFC_QR") && (
          <SmartcardLinkPanel
            orgId={client.id}
            state={await getSmartcardLinkState(client.id)}
            users={client.users.filter((u) => u.isActive).map(({ id, name, email }) => ({ id, name, email }))}
            planLimit={planMemberLimit(client.plan)}
          />
        )}

        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t.adminConsumptionTitle}</CardTitle>
            <BarChart3 className="h-4 w-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <ConsumptionChart data={consumption} />
          </CardContent>
        </Card>

        {hasModule("AI_WHATSAPP") && <AiBudgetPanel orgId={client.id} view={aiBudget} providers={listProviders().map((p) => p.name)} />}

        {hasModule("AUTOMATIONS") && (
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{t.adminInstalledTemplates}</CardTitle>
              <Layers className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {client.templateInstallations.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">{t.adminNoTemplates}</p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {client.templateInstallations.map((inst) => (
                    <div key={inst.id} className="flex items-center gap-3 rounded-lg border border-slate-100 p-3">
                      <span className="text-2xl leading-none flex-shrink-0">{inst.template.iconEmoji}</span>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/admin/templates/${inst.template.id}`}
                          className="text-sm font-medium text-slate-900 hover:underline truncate block"
                        >
                          {inst.template.name}
                        </Link>
                        <p className="text-xs text-slate-400">
                          v{inst.version.version} · {formatDate(inst.installedAt)}
                        </p>
                      </div>
                      {inst.status === "ACTIVE" && inst.automationId && inst.version.configSpec && <TemplateConfigButton orgId={client.id} automationId={inst.automationId} />}
                      <Badge
                        variant={inst.status === "ACTIVE" ? "success" : "secondary"}
                        className="text-xs flex-shrink-0"
                      >
                        {inst.status === "ACTIVE" ? t.statusActive : inst.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
