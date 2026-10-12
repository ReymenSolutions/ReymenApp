import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { getServerT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { PortalSectionTabs } from "@/components/portal/PortalSectionTabs";
import { getAutomationsTabs } from "@/lib/portal-nav-tabs";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { Zap, ArrowRight, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FeedbackCases } from "@/components/portal/FeedbackCases";
import { can } from "@/lib/permissions";
import { EXECUTION_LABEL, SKIP_REASON, describeAction } from "@/lib/automation/labels";
import { getAttributionSummary, ATTRIBUTION_WINDOW_DAYS } from "@/lib/automation/attribution";
import type { UserRole } from "@prisma/client";

async function getAutomations(orgId: string) {
  return prisma.automation.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: {
      events: {
        take: 3,
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { events: true } },
    },
  });
}

/** Lo que cada automatización inteligente hizo (o por qué no) con sus últimos eventos. */
async function getSmartActivity(orgId: string) {
  return prisma.automationExecution.findMany({
    where: { organizationId: orgId, automation: { blueprintKey: { not: null } } },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { id: true, status: true, skipReason: true, action: true, createdAt: true, automation: { select: { name: true } } },
  });
}

/** Calificaciones bajas (≤ 3) pendientes de seguimiento. */
async function getOpenFeedback(orgId: string) {
  const rows = await prisma.customerFeedback.findMany({ where: { organizationId: orgId, status: "OPEN" }, orderBy: { respondedAt: "desc" }, take: 20 });
  const customers = rows.length ? await prisma.customer.findMany({ where: { id: { in: rows.map((r) => r.customerId) }, organizationId: orgId }, select: { id: true, name: true, phone: true } }) : [];
  const byId = new Map(customers.map((c) => [c.id, c]));
  return rows.map((r) => ({ id: r.id, score: r.score ?? 0, comment: r.comment, customerName: byId.get(r.customerId)?.name ?? null, customerPhone: byId.get(r.customerId)?.phone ?? null, respondedAt: r.respondedAt }));
}

export default async function PortalAutomationsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AUTOMATIONS");

  const [t, automations, activity, feedbackCases, attribution] = await Promise.all([
    getServerT(),
    getAutomations(session.user.organizationId),
    getSmartActivity(session.user.organizationId),
    getOpenFeedback(session.user.organizationId),
    getAttributionSummary(session.user.organizationId, 30),
  ]);

  return (
    <div>
      <PageHeader
        title={t.automations}
        description={`${automations.length} ${t.automationsConfigured}`}
      />

      <PortalSectionTabs tabs={getAutomationsTabs(t)} />

      {automations.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={Zap}
              title={t.noAutomations}
              description={t.automationsEmptyDesc}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {automations.map((auto) => (
            <Card key={auto.id} className="hover:border-brand-200 hover:shadow-sm transition-all">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50">
                      <Zap className="h-4 w-4 text-brand-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{auto.name}</p>
                      {auto.description && (
                        <p className="text-xs text-slate-400 mt-0.5">{auto.description}</p>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={auto.status} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                  {auto.blueprintKey ? (
                    <span>
                      {auto.dryRun ? "En simulación" : "Envío real"} · {auto.lastRunAt ? `última ejecución ${formatDateTime(auto.lastRunAt)}` : "aún sin ejecuciones"}
                    </span>
                  ) : (
                    <span>{auto._count.events} {t.totalEvents}</span>
                  )}
                  <div className="flex items-center gap-3">
                    <span>{t.createdOn} {formatDate(auto.createdAt)}</span>
                    {!auto.blueprintKey && (
                      <Link
                        href={`/portal/automations/${auto.id}`}
                        className="flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium"
                      >
                        {t.viewDetail} <ArrowRight className="h-3 w-3" />
                      </Link>
                    )}
                  </div>
                </div>

                {auto.events.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-600">{t.latestEvents}</p>
                    {auto.events.map((event) => (
                      <div key={event.id} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                        <p className="text-xs text-slate-600">{event.type}</p>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={event.status} />
                          <span className="text-xs text-slate-400">{formatDateTime(event.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {attribution.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <p className="font-semibold text-slate-900">Ingresos asociados a automatizaciones</p>
            <p className="text-xs text-slate-400">
              Últimos 30 días. Se asocia una venta al último mensaje que el cliente recibió en los {ATTRIBUTION_WINDOW_DAYS} días anteriores a comprar (una venta cuenta para una sola automatización; las cancelaciones se restan). Son ingresos <strong>asociados</strong>, no prueba de que la automatización los provocó: el cliente pudo haber comprado de todos modos.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {attribution.map((a) => (
              <div key={a.automationId} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2">
                <p className="text-sm font-medium text-slate-700">{a.name}</p>
                <p className="text-xs text-slate-500">
                  {a.touches} mensajes enviados · {a.conversions} {a.conversions === 1 ? "venta asociada" : "ventas asociadas"} · <span className="font-semibold text-slate-900">{formatMoney(a.revenue)}</span>
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {feedbackCases.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <p className="font-semibold text-slate-900">Opiniones por atender ({feedbackCases.length})</p>
            <p className="text-xs text-slate-400">Calificaciones de 3 o menos tras una visita. Contacta al cliente y marca el seguimiento como resuelto.</p>
          </CardHeader>
          <CardContent>
            <FeedbackCases cases={feedbackCases} canResolve={can(session.user.role as UserRole, "conversations:resolve")} />
          </CardContent>
        </Card>
      )}

      {activity.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-3">
            <p className="flex items-center gap-2 font-semibold text-slate-900">
              <Activity className="h-4 w-4 text-brand-600" /> Actividad de las automatizaciones inteligentes
            </p>
            <p className="text-xs text-slate-400">Lo que hicieron con los últimos eventos, o por qué no actuaron. Las simuladas no avisan ni contactan a nadie.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {activity.map((e) => {
              const meta = EXECUTION_LABEL[e.status] ?? { label: e.status, variant: "secondary" as const };
              const detail = describeAction(e.action, formatMoney) ?? (e.skipReason ? `Omitida: ${SKIP_REASON[e.skipReason] ?? e.skipReason}` : null);
              return (
                <div key={e.id} className="flex items-start justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700">{e.automation.name}</p>
                    {detail && <p className="text-xs text-slate-500">{e.status === "SKIPPED" && e.skipReason ? `Omitida: ${SKIP_REASON[e.skipReason] ?? e.skipReason}` : detail}</p>}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                    <span className="text-xs text-slate-400">{formatDateTime(e.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}