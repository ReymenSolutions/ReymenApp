import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Zap, MessageSquare, FileText, AlertTriangle, CheckCircle2, Rocket, ArrowRight, UtensilsCrossed, CreditCard, Wallet } from "lucide-react";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { getOnboardingStatus } from "@/lib/onboarding";
import { getEnabledModules } from "@/lib/modules";
import { getFoodSalesSummary } from "@/lib/food";
import { getCrmDashboard } from "@/lib/crm-dashboard";
import { Reveal } from "@/components/motion/Reveal";
import { AnimatedBar } from "@/components/motion/AnimatedBar";
import { formatNumber } from "@/lib/format-number";
import { PageHeader } from "@/components/shared/PageHeader";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDate, formatMoney } from "@/lib/utils";
import type { PlatformModule } from "@prisma/client";

async function getPortalMetrics(orgId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    totalLeads,
    newLeadsToday,
    activeAutomations,
    automationErrors,
    openConversations,
    escalatedConversations,
    openRequests,
    recentLeads,
    recentEvents,
  ] = await Promise.all([
    prisma.lead.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.lead.count({ where: { organizationId: orgId, deletedAt: null, createdAt: { gte: today } } }),
    prisma.automation.count({ where: { organizationId: orgId, status: "ACTIVE" } }),
    prisma.automation.count({ where: { organizationId: orgId, status: "ERROR" } }),
    prisma.conversation.count({ where: { organizationId: orgId, status: "OPEN" } }),
    prisma.conversation.count({ where: { organizationId: orgId, status: "ESCALATED" } }),
    prisma.request.count({ where: { organizationId: orgId, status: "OPEN" } }),
    prisma.lead.findMany({
      where: { organizationId: orgId, deletedAt: null },
      take: 5,
      orderBy: { createdAt: "desc" },
    }),
    prisma.automationEvent.findMany({
      where: { organizationId: orgId },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { automation: { select: { name: true } } },
    }),
  ]);

  return {
    totalLeads, newLeadsToday, activeAutomations, automationErrors,
    openConversations, escalatedConversations, openRequests, recentLeads, recentEvents,
  };
}

export default async function PortalDashboardPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");

  const [t, lang, metrics, onboarding, enabledModules] = await Promise.all([
    getServerT(),
    getServerLang(),
    getPortalMetrics(session.user.organizationId),
    getOnboardingStatus(session.user.organizationId),
    getEnabledModules(session.user.organizationId),
  ]);

  const hasModule = (m: PlatformModule) => enabledModules.includes(m);

  // Food's own DB (same Prisma connection, no external dependency), so it's
  // safe to pull live numbers onto the org-wide home page — only queried
  // when the module is actually enabled. SmartCard doesn't get the same
  // treatment: its data lives in a separate Supabase project, and resolving
  // membership there means an external round-trip (plus, today, an O(n)
  // scan over every active member to match the caller's email) that this
  // page — the one every login lands on — shouldn't have to wait on or
  // degrade for. Its card below is a plain link, not a live widget.
  const crm = hasModule("CRM") ? await getCrmDashboard(session.user.organizationId) : null;
  const pipeline = crm?.pipeline ?? null;
  const foodSummary = hasModule("FOOD_OPS")
    ? await getFoodSalesSummary(session.user.organizationId)
    : null;

  // Actionable, module-aware: only items the client can actually do something
  // about right now, each linking straight to where they'd fix it. A disabled
  // module's data never shows up here as something to act on.
  const needsAttention: { label: string; count: number; href: string }[] = [];
  if (hasModule("AUTOMATIONS") && metrics.automationErrors > 0) {
    needsAttention.push({ label: t.dashboardAutomationErrorsNote, count: metrics.automationErrors, href: "/portal/automations" });
  }
  if (hasModule("AI_WHATSAPP") && metrics.escalatedConversations > 0) {
    needsAttention.push({ label: t.dashboardEscalatedNote, count: metrics.escalatedConversations, href: "/portal/conversations" });
  }
  if (metrics.openRequests > 0) {
    needsAttention.push({ label: t.dashboardOpenRequestsNote, count: metrics.openRequests, href: "/portal/requests" });
  }

  return (
    <div>
      <PageHeader
        title={t.dashboard}
        description={`${t.welcomeBack}, ${session.user.name ?? session.user.email}`}
      />

      {!onboarding.allDone && !onboarding.onboardingCompletedAt && (
        <Link
          href="/portal/onboarding"
          className="info-box mb-6 flex items-center justify-between rounded-lg border border-brand-200 bg-brand-50 p-4 hover:bg-brand-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Rocket className="info-box-icon h-5 w-5 text-brand-600 flex-shrink-0" />
            <div>
              <p className="info-box-title text-sm font-medium text-brand-900">
                {lang === "es"
                  ? `Termina de configurar tu cuenta — ${onboarding.completedCount} de ${onboarding.totalCount} pasos completados`
                  : `Finish setting up your account — ${onboarding.completedCount} of ${onboarding.totalCount} steps completed`}
              </p>
              <p className="info-box-text text-xs text-brand-700 mt-0.5">
                {lang === "es"
                  ? "Completa la configuración inicial para aprovechar todo Reymen Solutions."
                  : "Complete the initial setup to get the most out of Reymen Solutions."}
              </p>
            </div>
          </div>
          <ArrowRight className="info-box-icon h-4 w-4 text-brand-600 flex-shrink-0" />
        </Link>
      )}

      <Card className={`mb-6 ${needsAttention.length > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
        <CardContent className="p-4">
          {needsAttention.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <AlertTriangle className="h-4 w-4" />
                {t.dashboardNeedsAttention}
              </div>
              {needsAttention.map((item) => (
                <Link key={item.label} href={item.href} className="text-sm text-amber-700 hover:underline">
                  <strong>{item.count}</strong> {item.label}
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              {t.dashboardAllClear}
            </div>
          )}
        </CardContent>
      </Card>

      {pipeline && (
        <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <MetricCard
            variant="hero"
            index={0}
            className="lg:col-span-2"
            title={lang === "es" ? "Valor en pipeline" : "Pipeline value"}
            value={pipeline.total}
            format={{ style: "currency", currency: pipeline.currency }}
            icon={Wallet}
            description={`${pipeline.count} ${lang === "es" ? (pipeline.count === 1 ? "oportunidad abierta" : "oportunidades abiertas") : pipeline.count === 1 ? "open opportunity" : "open opportunities"}${pipeline.otherCurrencies.length > 0 ? ` · ${lang === "es" ? "también en" : "also in"} ${pipeline.otherCurrencies.map((o) => `${formatNumber(o.total, { style: "currency", currency: o.currency })}`).join(", ")}` : ""}`}
          >
            {pipeline.total > 0 && (
              <ul className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                {pipeline.byStage.map((st) => (
                  <li key={st.id}>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-brand-100">
                      <span className="truncate">{st.name}</span>
                      <span className="tabular-nums">{formatNumber(st.total, { style: "currency", currency: pipeline.currency })}</span>
                    </div>
                    <AnimatedBar value={st.share} label={st.name} trackClassName="bg-[rgb(255_255_255/0.15)]" className="bg-[rgb(255_255_255)]" />
                  </li>
                ))}
              </ul>
            )}
          </MetricCard>
          <MetricCard
            index={1}
            title={lang === "es" ? "Leads nuevos (7 días)" : "New leads (7 days)"}
            value={crm?.leads.last7 ?? 0}
            icon={Users}
            iconClassName="bg-emerald-50"
            trend={crm && crm.leads.change !== null ? { value: crm.leads.change, label: lang === "es" ? "vs 7 días previos" : "vs previous 7 days" } : undefined}
            description={`${metrics.newLeadsToday} ${lang === "es" ? "hoy" : "today"}`}
          />
        </div>
      )}

      <div className={`grid grid-cols-2 gap-4 mb-6 lg:grid-cols-3 ${pipeline ? "xl:grid-cols-5" : "xl:grid-cols-6"}`}>
        <MetricCard index={2} title={t.totalLeads} value={metrics.totalLeads} icon={Users} />
        {!pipeline && <MetricCard index={3} title={t.leadsToday} value={metrics.newLeadsToday} icon={Users} iconClassName="bg-emerald-50" />}
        <MetricCard index={4} title={t.automations} value={metrics.activeAutomations} icon={Zap} />
        <MetricCard index={5} title={t.errors} value={metrics.automationErrors} icon={AlertTriangle} iconClassName="bg-red-50" />
        <MetricCard index={6} title={t.conversations} value={metrics.openConversations} icon={MessageSquare} />
        <MetricCard index={7} title={t.requests} value={metrics.openRequests} icon={FileText} />
      </div>

      {(hasModule("FOOD_OPS") || hasModule("NFC_QR")) && (
        <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-2">
          {hasModule("FOOD_OPS") && foodSummary && (
            <Link
              href="/portal/food"
              className="flex items-center justify-between rounded-card border border-slate-200 bg-white p-4 shadow-card motion-micro transition-[border-color,box-shadow,background-color] hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-card-hover"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-50 p-2">
                  <UtensilsCrossed className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {lang === "es" ? "Foods — ventas de hoy" : "Foods — today's sales"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatMoney(foodSummary.today.gross)}
                    {" · "}
                    {foodSummary.today.count} {lang === "es" ? "venta(s)" : "sale(s)"}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
            </Link>
          )}
          {hasModule("NFC_QR") && (
            <Link
              href="/portal/smartcard"
              className="flex items-center justify-between rounded-card border border-slate-200 bg-white p-4 shadow-card motion-micro transition-[border-color,box-shadow,background-color] hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-card-hover"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-brand-50 p-2">
                  <CreditCard className="h-4 w-4 text-brand-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">SmartCard</p>
                  <p className="text-xs text-slate-400">
                    {lang === "es" ? "Ver equipo y módulos contratados" : "View team and contracted modules"}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-300" />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Reveal index={8}><Card className="h-full">
          <CardHeader><CardTitle>{t.recentLeads}</CardTitle></CardHeader>
          <CardContent>
            {metrics.recentLeads.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">{t.noLeadsYet}</p>
            ) : (
              <div className="space-y-3">
                {metrics.recentLeads.map((lead) => (
                  <div key={lead.id} className="-mx-2 flex items-center justify-between rounded-md px-2 py-1.5 motion-micro hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{lead.name}</p>
                      <p className="text-xs text-slate-400">
                        {lead.source ?? "manual"} · {formatDate(lead.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card></Reveal>

        <Reveal index={9}><Card className="h-full">
          <CardHeader><CardTitle>{t.automationActivity}</CardTitle></CardHeader>
          <CardContent>
            {metrics.recentEvents.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">{t.noRecentActivity}</p>
            ) : (
              <div className="space-y-3">
                {metrics.recentEvents.map((event) => (
                  <div key={event.id} className="-mx-2 flex items-center justify-between rounded-md px-2 py-1.5 motion-micro hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{event.automation.name}</p>
                      <p className="text-xs text-slate-400">{formatDate(event.createdAt)}</p>
                    </div>
                    <StatusBadge status={event.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card></Reveal>
      </div>
    </div>
  );
}
