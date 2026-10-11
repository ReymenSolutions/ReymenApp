import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InviteUserForm } from "@/components/portal/InviteUserForm";
import { RemoveUserButton } from "@/components/portal/RemoveUserButton";
import { EditUserDialog } from "@/components/portal/EditUserDialog";
import { BillingActions } from "@/components/portal/BillingActions";
import { PipelineStagesPanel } from "@/components/portal/PipelineStagesPanel";
import { formatDate } from "@/lib/utils";
import { can } from "@/lib/permissions";
import { PLAN_LIMITS, PLAN_MODULES, isUnlimited } from "@/lib/permissions";
import { getModuleLabel } from "@/lib/modules";
import { isStripeConfigured } from "@/lib/stripe";
import type { UserRole } from "@prisma/client";

export default async function PortalSettingsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");

  const [t, lang, org, crmEnabled, pipelineStages] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.organization.findUnique({
      where: { id: session.user.organizationId },
      include: {
        users: {
          where: { isActive: true },
          select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    hasModule(session.user.organizationId, "CRM"),
    prisma.pipelineStage.findMany({
      where: { organizationId: session.user.organizationId },
      orderBy: { order: "asc" },
      include: { _count: { select: { opportunities: true } } },
    }),
  ]);

  if (!org) return redirect("/login");

  const canManageTeam = can(session.user.role as UserRole, "team:manage");
  const canManageBilling = can(session.user.role as UserRole, "settings:manage");
  const canManagePipeline = can(session.user.role as UserRole, "pipeline:manage");
  const plan = PLAN_LIMITS[org.plan] ?? PLAN_LIMITS.starter;
  const planModules = PLAN_MODULES[org.plan] ?? PLAN_MODULES.starter;
  const stripeEnabled = isStripeConfigured();
  const hasActiveSubscription =
    org.stripeSubscriptionStatus === "active" || org.stripeSubscriptionStatus === "trialing";

  return (
    <div>
      <PageHeader title={t.settingsTitle} description={t.accountInfo} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Organization info */}
        <Card>
          <CardHeader><CardTitle>{t.organization}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: t.colName, value: org.name },
              { label: t.colSlug, value: org.slug },
              { label: t.colIndustry, value: org.industry ?? "—" },
              { label: t.clientSince, value: formatDate(org.createdAt) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="font-medium text-slate-900">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Plan info */}
        <Card>
          <CardHeader><CardTitle>{t.currentPlan}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{t.plan}</span>
              <Badge variant="secondary" className="capitalize text-sm px-3">{plan.label}</Badge>
            </div>
            <div className="space-y-2">
              {[
                { label: t.includedLeads, value: isUnlimited(plan.leads) ? t.unlimited : plan.leads.toLocaleString("en-US") },
                { label: t.users, value: isUnlimited(plan.users) ? t.unlimited : plan.users },
                { label: t.automations, value: isUnlimited(plan.automations) ? t.unlimitedF : plan.automations },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">
              {lang === "es" ? "Tu plan incluye" : "Your plan includes"}: {planModules.map((m) => getModuleLabel(lang)[m]).join(", ")}
            </p>
            {stripeEnabled && canManageBilling ? (
              <BillingActions hasActiveSubscription={hasActiveSubscription} />
            ) : (
              <div className="info-box rounded-lg bg-brand-50 border border-brand-100 p-3">
                <p className="info-box-text text-xs text-brand-700">{t.capacityMessage}</p>
                <a href="/portal/requests" className="info-box-icon mt-1.5 inline-block text-xs font-medium text-brand-600 hover:underline">
                  {t.openRequest}
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Team management */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t.team} ({org.users.length} {t.users.toLowerCase()})</CardTitle>
            {canManageTeam && <InviteUserForm />}
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {org.users.map((user) => {
                const isCurrentUser = user.id === session.user.id;
                const isOwner = user.role === "OWNER";
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between rounded-lg border border-slate-100 p-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900">
                          {user.name ?? t.noName}
                          {isCurrentUser && (
                            <span className="ml-1.5 text-xs text-slate-400">{t.you}</span>
                          )}
                        </p>
                        <Badge variant={isOwner ? "default" : "secondary"} className="capitalize text-xs">
                          {user.role.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                    {canManageTeam && !isCurrentUser && !isOwner && (
                      <div className="flex items-center gap-1">
                        <EditUserDialog userId={user.id} userName={user.name ?? t.noName} userRole={user.role} />
                        <RemoveUserButton userId={user.id} userName={user.name ?? user.email} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Pipeline stages (CRM module only) */}
        {crmEnabled && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{lang === "es" ? "Etapas del pipeline" : "Pipeline stages"}</CardTitle>
            </CardHeader>
            <CardContent>
              <PipelineStagesPanel
                stages={pipelineStages.map((s) => ({
                  id: s.id,
                  name: s.name,
                  order: s.order,
                  isWon: s.isWon,
                  isLost: s.isLost,
                  leadStatus: s.leadStatus,
                  opportunityCount: s._count.opportunities,
                }))}
                canManage={canManagePipeline}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
