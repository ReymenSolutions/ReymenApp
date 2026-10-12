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
import { formatDate, formatDateTime } from "@/lib/utils";
import { Zap, ArrowRight, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

const EXECUTION_LABEL: Record<string, { label: string; variant: "success" | "secondary" | "destructive" | "warning" | "info" }> = {
  SUCCEEDED: { label: "Hecha", variant: "success" },
  DISPATCHED: { label: "Enviada", variant: "info" },
  PENDING: { label: "En cola", variant: "info" },
  DRY_RUN: { label: "Simulada", variant: "secondary" },
  SKIPPED: { label: "Omitida", variant: "secondary" },
  FAILED: { label: "Falló", variant: "destructive" },
};

const SKIP_REASON: Record<string, string> = {
  no_consent: "el cliente no dio su consentimiento",
  quiet_hours: "horario de silencio",
  cooldown: "ya se le contactó hace poco",
  do_not_contact: "el cliente pidió no ser contactado",
  no_phone: "sin teléfono",
  not_low: "el insumo no está bajo",
  below_min_level: "no llega al nivel configurado",
  module_disabled: "módulo apagado",
  invalid_config: "configuración inválida",
  blueprint_unavailable: "automatización no disponible",
  no_customer: "sin cliente",
};

/** Lo que cada automatización inteligente hizo (o por qué no) con sus últimos eventos. */
async function getSmartActivity(orgId: string) {
  return prisma.automationExecution.findMany({
    where: { organizationId: orgId, automation: { blueprintKey: { not: null } } },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: { id: true, status: true, skipReason: true, action: true, createdAt: true, automation: { select: { name: true } } },
  });
}

function describeAction(action: unknown): string | null {
  const a = (action ?? {}) as { type?: string; title?: string; body?: string; templateKey?: string; recipient?: { name?: string | null } };
  if (a.type === "alert") return `${a.title ?? ""}${a.body ? ` — ${a.body}` : ""}`;
  if (a.type === "message") return `Mensaje a ${a.recipient?.name ?? "un cliente"}`;
  return null;
}

export default async function PortalAutomationsPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AUTOMATIONS");

  const [t, automations, activity] = await Promise.all([
    getServerT(),
    getAutomations(session.user.organizationId),
    getSmartActivity(session.user.organizationId),
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
                  <span>{auto._count.events} {t.totalEvents}</span>
                  <div className="flex items-center gap-3">
                    <span>{t.createdOn} {formatDate(auto.createdAt)}</span>
                    <Link
                      href={`/portal/automations/${auto.id}`}
                      className="flex items-center gap-1 text-brand-600 hover:text-brand-700 font-medium"
                    >
                      {t.viewDetail} <ArrowRight className="h-3 w-3" />
                    </Link>
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
              const detail = describeAction(e.action) ?? (e.skipReason ? `Omitida: ${SKIP_REASON[e.skipReason] ?? e.skipReason}` : null);
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