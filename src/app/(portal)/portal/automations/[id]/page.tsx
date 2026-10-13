import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Zap, Activity, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import { getServerLang } from "@/lib/i18n-server";

const EVENT_STATUS_ICON: Record<string, typeof CheckCircle2> = {
  SUCCESS: CheckCircle2,
  FAILED: AlertCircle,
  PENDING: Clock,
};

async function getAutomationDetail(id: string, orgId: string) {
  return prisma.automation.findFirst({
    where: { id, organizationId: orgId },
    include: {
      events: {
        take: 50,
        orderBy: { createdAt: "desc" },
      },
      _count: { select: { events: true } },
    },
  });
}

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AUTOMATIONS");

  const { id } = await params;
  const [automation, lang] = await Promise.all([
    getAutomationDetail(id, session.user.organizationId),
    getServerLang(),
  ]);
  if (!automation) notFound();

  const successCount = automation.events.filter((e) => e.status === "SUCCESS").length;
  const failedCount = automation.events.filter((e) => e.status === "FAILED").length;
  const successRate = automation._count.events > 0
    ? Math.round((successCount / automation._count.events) * 100)
    : null;

  return (
    <div>
      <div className="mb-4">
        <Link href="/portal/automations" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> {lang === "es" ? "Volver a automatizaciones" : "Back to automations"}
        </Link>
      </div>

      <PageHeader
        title={automation.name}
        description={automation.description ?? automation.type}
        actions={<StatusBadge status={automation.status} />}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
        {[
          { label: lang === "es" ? "Total eventos" : "Total events", value: automation._count.events },
          { label: lang === "es" ? "Exitosos" : "Successful", value: successCount },
          { label: lang === "es" ? "Fallidos" : "Failed", value: failedCount },
          { label: lang === "es" ? "Tasa de éxito" : "Success rate", value: successRate !== null ? `${successRate}%` : "—" },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="p-4 text-center">
              <p className="text-lg font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Config */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              {lang === "es" ? "Configuración" : "Configuration"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: lang === "es" ? "Tipo" : "Type", value: automation.type },
              { label: lang === "es" ? "Estado" : "Status", value: <StatusBadge status={automation.status} /> },
              { label: lang === "es" ? "ID de workflow n8n" : "n8n workflow ID", value: automation.n8nWorkflowId ?? "—" },
            { label: lang === "es" ? "ID de automatización" : "Automation ID", value: automation.id.slice(-12) },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{label}</span>
                <span className="font-medium text-slate-900 font-mono text-xs">{value}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Event log */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {lang === "es" ? "Historial de eventos" : "Event history"} ({automation._count.events})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {automation.events.length === 0 ? (
              <div className="py-8 text-center">
                <Activity className="mx-auto h-8 w-8 text-slate-200 mb-2" />
                <p className="text-sm text-slate-400">{lang === "es" ? "Sin eventos registrados aún" : "No events recorded yet"}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {automation.events.map((event) => {
                  const Icon = EVENT_STATUS_ICON[event.status] ?? Clock;
                  const isSuccess = event.status === "SUCCESS";
                  const isFailed = event.status === "FAILED";
                  return (
                    <div
                      key={event.id}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        isFailed ? "border-red-100 bg-red-50/50" : "border-slate-100"
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                          isSuccess ? "text-emerald-500" : isFailed ? "text-red-500" : "text-slate-400"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-900">{event.type}</span>
                          <span className="text-xs text-slate-400 flex-shrink-0">
                            {formatDateTime(event.createdAt, lang)}
                          </span>
                        </div>
                        {event.errorMessage && (
                          <p className="text-xs text-red-600 mt-0.5">{event.errorMessage}</p>
                        )}
                        {event.duration && (
                          <p className="text-xs text-slate-400 mt-0.5">{event.duration}ms</p>
                        )}
                      </div>
                      <StatusBadge status={event.status} />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
