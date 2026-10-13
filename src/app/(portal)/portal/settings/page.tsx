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
import { getPlan, monthlyPriceMxn, planDescription, planName } from "@/lib/plans";
import { accentTone } from "@/lib/plan-accent";
import { getModuleLabel } from "@/lib/modules";
import { isStripeConfigured } from "@/lib/stripe";
import { getBillingView } from "@/lib/billing";
import { SubscriptionStatus } from "@/components/portal/SubscriptionStatus";
import type { UserRole } from "@prisma/client";
import { CustomFieldsPanel } from "@/components/portal/CustomFieldsPanel";
import { MAX_CUSTOM_FIELDS } from "@/lib/custom-fields";
import { BranchesPanel } from "@/components/portal/BranchesPanel";
import { MAX_BRANCHES } from "@/lib/branches";

export default async function PortalSettingsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");

  const [t, lang, org, crmEnabled, pipelineStages, customFields, foodEnabled, branches] = await Promise.all([
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
    prisma.customField.findMany({ where: { organizationId: session.user.organizationId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
    hasModule(session.user.organizationId, "FOOD_OPS"),
    prisma.branch.findMany({ where: { organizationId: session.user.organizationId }, orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }),
  ]);

  if (!org) return redirect("/login");

  const canManageTeam = can(session.user.role as UserRole, "team:manage");
  const canManageBilling = can(session.user.role as UserRole, "settings:manage");
  const canManagePipeline = can(session.user.role as UserRole, "pipeline:manage");
  const plan = await getPlan(org.plan);
  const billing = await getBillingView(org.id);
  const planModules = plan.modules;
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
              { label: t.clientSince, value: formatDate(org.createdAt, lang) },
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
              <Badge variant="outline" className={`border-transparent text-sm px-3 ${accentTone(plan.accent).badge}`}>{planName(plan, lang)}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{lang === "es" ? "Mensualidad" : "Monthly price"}</span>
              <span className="text-sm font-medium text-slate-900">
                ${monthlyPriceMxn(plan, org.customMonthlyPriceMxn !== null ? Number(org.customMonthlyPriceMxn) : null).toLocaleString("en-US")} MXN/{lang === "es" ? "mes" : "mo"}
              </span>
            </div>
            <div className="space-y-2">
              {[
                { label: t.includedLeads, value: plan.limits.leads === null ? t.unlimited : plan.limits.leads.toLocaleString("en-US") },
                { label: t.users, value: plan.limits.users === null ? t.unlimited : plan.limits.users },
                { label: t.automations, value: plan.limits.automations === null ? t.unlimitedF : plan.limits.automations },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ))}
            </div>
            {planDescription(plan, lang) && <p className="text-xs text-slate-500">{planDescription(plan, lang)}</p>}
            {plan.features.length > 0 && (
              <ul className="space-y-1 text-xs text-slate-600">
                {plan.features.map((f) => (
                  <li key={f.es} className="flex gap-1.5"><span aria-hidden="true" className="text-emerald-600">✓</span>{lang === "en" ? f.en : f.es}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-slate-400">
              {lang === "es" ? "Tu plan incluye" : "Your plan includes"}: {planModules.map((m) => getModuleLabel(lang)[m]).join(", ")}
            </p>
            {canManageBilling && <SubscriptionStatus view={billing} lang={lang} />}
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

        {/* Sucursales (Foods module only) */}
        {foodEnabled && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{lang === "es" ? "Sucursales" : "Branches"}</CardTitle>
            </CardHeader>
            <CardContent>
              <BranchesPanel branches={branches.map((b) => ({ id: b.id, name: b.name, isActive: b.isActive }))} canManage={canManageBilling} max={MAX_BRANCHES} menuPerBranch={org.menuPerBranch} inventoryPerBranch={org.inventoryPerBranch} />
            </CardContent>
          </Card>
        )}

        {/* Campos personalizados de los contactos (CRM module only) */}
        {crmEnabled && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{lang === "es" ? "Campos personalizados" : "Custom fields"}</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomFieldsPanel
                fields={customFields.map((f) => ({ id: f.id, label: f.label, type: f.type, options: f.options, isActive: f.isActive }))}
                canManage={canManageBilling}
                max={MAX_CUSTOM_FIELDS}
              />
            </CardContent>
          </Card>
        )}

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
