import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { getPortalAiUsage } from "@/lib/ai/portal-usage";
import { PageHeader } from "@/components/shared/PageHeader";
import { PortalSectionTabs } from "@/components/portal/PortalSectionTabs";
import { AiUsageRequestButton } from "@/components/portal/AiUsageRequestButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAiWhatsappTabs } from "@/lib/portal-nav-tabs";
import { formatDate } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

const TONE = { OK: "bg-emerald-500", WARN_75: "bg-amber-500", CRITICAL_90: "bg-orange-500", EXHAUSTED: "bg-red-500" } as const;

/** Portal → Mi consumo de IA: solo información comercial (porcentajes y fechas), nunca costos ni presupuestos internos. */
export default async function AiUsagePage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AI_WHATSAPP");
  if (!can(session.user.role as UserRole, "settings:view")) return redirect("/portal/dashboard");

  const [lang, t, u] = await Promise.all([getServerLang(), getServerT(), getPortalAiUsage(session.user.organizationId)]);
  const es = lang === "es";
  const planName = es ? u.planName : u.planNameEn || u.planName;

  return (
    <div>
      <PageHeader
        title={es ? "Mi consumo de IA" : "My AI usage"}
        description={es ? "Tu plan incluye el uso de agentes de IA bajo una política de uso justo. Puedes consultar tu consumo y adquirir capacidad adicional cuando la necesites." : "Your plan includes the use of AI agents under a fair-use policy. You can check your usage and get additional capacity whenever you need it."}
      />
      <PortalSectionTabs tabs={getAiWhatsappTabs(t, session.user.role as UserRole)} />

      <div className="space-y-4">
        {u.paused && (
          <p role="alert" className="rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {es ? `Usaste toda la capacidad de IA de este ciclo, así que tus agentes están en pausa y las conversaciones pasan a tu equipo. Se reanudan solos el ${formatDate(u.renewsAt)} o en cuanto amplíes tu capacidad. Tu configuración y tus conversaciones no se pierden.` : `You've used all of this cycle's AI capacity, so your agents are paused and conversations go to your team. They resume on their own on ${formatDate(u.renewsAt)} or as soon as you add capacity. Your settings and conversations are safe.`}
          </p>
        )}
        {!u.paused && (u.status === "WARN_75" || u.status === "CRITICAL_90") && (
          <p role="status" className="rounded-card border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {es ? `Ya usaste el ${u.usedPercent} % de tu capacidad de IA de este ciclo. Si la agotas, tus agentes se pausan hasta el ${formatDate(u.renewsAt)}.` : `You've used ${u.usedPercent}% of this cycle's AI capacity. If it runs out, your agents pause until ${formatDate(u.renewsAt)}.`}
          </p>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{es ? "Capacidad de este ciclo" : "This cycle's capacity"}</CardTitle>
            <p className="text-xs text-slate-500">{es ? "Plan" : "Plan"} {planName} · {es ? "se renueva el" : "renews on"} {formatDate(u.renewsAt)}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-3xl font-bold text-slate-900">{u.usedPercent} %<span className="ml-2 text-sm font-normal text-slate-500">{es ? "usado" : "used"}</span></p>
              <p className="text-sm text-slate-600">{es ? "Te queda" : "You have"} <strong>{u.remainingPercent} %</strong> {es ? "de tu capacidad incluida" : "of your included capacity left"}</p>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={u.usedPercent} aria-valuemin={0} aria-valuemax={100} aria-label={es ? "Capacidad de IA usada" : "AI capacity used"}>
              <div className={`h-full ${TONE[u.status]}`} style={{ width: `${u.usedPercent}%` }} />
            </div>
            {u.alerts.length > 0 && (
              <p className="text-xs text-slate-500">{es ? "Avisos de este ciclo" : "Notices this cycle"}: {u.alerts.map((a) => `${a.threshold} % (${formatDate(a.at)})`).join(" · ")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{es ? "¿Necesitas más capacidad?" : "Need more capacity?"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600">{es ? "Pide capacidad adicional y tu equipo de Reymen te confirma la recarga o el plan que mejor te acomode. No se cobra nada al enviar la solicitud." : "Ask for additional capacity and your Reymen team will confirm the top-up or plan that suits you best. Nothing is charged when you send the request."}</p>
            <AiUsageRequestButton pending={u.pendingRequest} />
          </CardContent>
        </Card>

        {u.history.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{es ? "Ciclos anteriores" : "Previous cycles"}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {u.history.map((h) => (
                  <li key={h.cycleStart.toISOString()} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-44 flex-shrink-0 text-slate-600">{formatDate(h.cycleStart)} → {formatDate(h.cycleEnd)}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full ${h.usedPercent >= 100 ? TONE.EXHAUSTED : h.usedPercent >= 75 ? TONE.WARN_75 : TONE.OK}`} style={{ width: `${h.usedPercent}%` }} /></span>
                    <span className="w-12 text-right font-medium text-slate-900">{h.usedPercent} %</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
