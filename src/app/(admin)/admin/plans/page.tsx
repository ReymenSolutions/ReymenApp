import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getServerLang } from "@/lib/i18n-server";
import { listClientsForCustomPlan, listClientsOverAgentCap, listCustomPlanClients, listPlansForAdmin } from "@/actions/admin/plans";
import { accentTone } from "@/lib/plan-accent";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanEditorDialog } from "@/components/admin/PlanEditorDialog";
import { CustomPlanDialog } from "@/components/admin/CustomPlanDialog";
import { getModuleLabel } from "@/lib/modules";
import { customPlanName, planDescription, planName } from "@/lib/plans";
import { formatDateTime } from "@/lib/utils";

/**
 * Cuánto ancho ocupa cada card para que la última fila nunca deje un hueco: la cuadrícula tiene 6 columnas en pantallas grandes
 * (cada card normal ocupa 2 = tres por fila). Si la última fila trae 1 card, ocupa todo el ancho; si trae 2, se reparten la mitad.
 * En pantallas medianas (2 columnas) un total impar deja la última card a todo lo ancho.
 */
function spanClass(index: number, total: number): string {
  const rest = total % 3;
  const inLastRow = rest !== 0 && index >= total - rest;
  const large = !inLastRow ? "lg:col-span-2" : rest === 1 ? "lg:col-span-6" : "lg:col-span-3";
  const medium = total % 2 === 1 && index === total - 1 ? "md:col-span-2" : "";
  return `${large} ${medium}`.trim();
}

/** Admin → Planes: el catálogo comercial. Lo que se edita aquí es lo que ven y usan todas las pantallas y reglas conectadas. */
export default async function AdminPlansPage() {
  const es = (await getServerLang()) === "es";
  const lang = es ? "es" : "en";
  const [plans, customClients, overCap, allClients] = await Promise.all([listPlansForAdmin(), listCustomPlanClients(), listClientsOverAgentCap(), listClientsForCustomPlan()]);
  const moduleLabel = getModuleLabel(lang);
  const wideCustom = spanClass(plans.length, plans.length + 1).includes("lg:col-span-6");
  const limit = (n: number | null, one: string, many: string, unlimited: string) => (n === null ? unlimited : `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title={es ? "Planes" : "Plans"}
        description={es ? "Nombre, precio, límites, presupuesto de IA y qué incluye cada plan. Al guardar, el cambio se aplica de inmediato en Configuración del cliente, Cambiar plan, ROI, límites, presupuesto de IA, módulos y métricas." : "Name, price, limits, AI budget and what each plan includes. On save, the change applies immediately in client Settings, Change plan, ROI, limits, AI budget, modules and metrics."}
        actions={<PlanEditorDialog />}
      />

      {overCap.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{es ? "Clientes por encima de su tope de agentes IA" : "Clients over their AI agents cap"} ({overCap.length})</CardTitle>
            <p className="text-xs text-slate-600">{es ? "Conservan los agentes que ya tenían, pero no pueden activar más. Ajusta su tope en Cliente → Presupuesto de IA o cambia su plan." : "They keep the agents they already had but cannot turn more on. Adjust their cap in Client → AI budget or change their plan."}</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-amber-100 rounded-lg border border-amber-100 bg-white/70">
              {overCap.map((c) => (
                <li key={c.orgId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <Link href={`/admin/clients/${c.orgId}#ia-presupuesto`} className="min-w-0 truncate font-medium text-slate-900 hover:underline">{c.name}</Link>
                  <span className="flex-shrink-0 text-xs text-slate-600">{c.active} / {c.cap} · {c.source === "custom" ? customPlanName(lang) : c.source === "override" ? (es ? "tope pactado" : "agreed cap") : c.plan}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        {plans.map((p, index) => (
          <div key={p.key} className={spanClass(index, plans.length + 1)}>
          <Card className={`h-full ${accentTone(p.accent).card} ${p.isActive ? "" : "opacity-70"}`}>
            <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className={`h-2.5 w-2.5 rounded-full ${accentTone(p.accent).dot}`} aria-hidden="true" /> {planName(p, lang)}
                  {!p.isActive && <Badge variant="secondary" className="text-[10px]">{es ? "Retirado" : "Retired"}</Badge>}
                </CardTitle>
                <p className="mt-1 text-xs text-slate-500">{p.key} · v{p.version} · {p.clients} {es ? (p.clients === 1 ? "cliente" : "clientes") : p.clients === 1 ? "client" : "clients"}</p>
              </div>
              <PlanEditorDialog plan={p} />
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-3xl font-bold text-slate-900">${p.priceMxn.toLocaleString("en-US")} <span className="text-sm font-normal text-slate-500">MXN/{es ? "mes" : "mo"}</span></p>
              {planDescription(p, lang) && <p className="text-sm text-slate-600">{planDescription(p, lang)}</p>}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-slate-500">Leads</dt><dd className="text-right font-medium">{limit(p.limits.leads, "lead", "leads", es ? "Ilimitados" : "Unlimited")}</dd>
                <dt className="text-slate-500">{es ? "Usuarios" : "Users"}</dt><dd className="text-right font-medium">{limit(p.limits.users, es ? "usuario" : "user", es ? "usuarios" : "users", es ? "Ilimitados" : "Unlimited")}</dd>
                <dt className="text-slate-500">{es ? "Automatizaciones" : "Automations"}</dt><dd className="text-right font-medium">{p.limits.automations === null ? (es ? "Ilimitadas" : "Unlimited") : p.limits.automations}</dd>
                <dt className="text-slate-500">{es ? "Agentes IA" : "AI agents"}</dt><dd className="text-right font-medium">{p.maxAiAgents === null ? (es ? "Sin tope" : "No cap") : p.maxAiAgents}</dd>
                <dt className="text-slate-500">{es ? "Presupuesto de IA" : "AI budget"}</dt><dd className="text-right font-medium">${p.aiBudgetMxn.toLocaleString("en-US")} MXN</dd>
              </dl>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{es ? "Módulos" : "Modules"}</p>
                <div className="flex flex-wrap gap-1.5">{p.modules.map((m) => <Badge key={m} variant="outline" className="text-[10px]">{moduleLabel[m]}</Badge>)}</div>
              </div>
              {p.features.length > 0 && (
                <ul className="space-y-1 text-sm text-slate-700">
                  {p.features.map((f) => <li key={f.es} className="flex gap-1.5"><span aria-hidden="true" className="text-emerald-600">✓</span>{es ? f.es : f.en}</li>)}
                </ul>
              )}
              {p.revisions.length > 0 && (
                <p className="border-t border-slate-100 pt-2 text-xs text-slate-400">
                  {es ? "Último cambio" : "Last change"}: v{p.revisions[0].version} · {p.revisions[0].changedBy ?? (es ? "sistema" : "system")} · {formatDateTime(p.revisions[0].createdAt, lang)}
                </p>
              )}
            </CardContent>
          </Card>
          </div>
        ))}

        {/* «A la medida» (Custom Service): no es una fila del catálogo. Cada cliente tiene sus propios módulos (interruptores),
            cantidades (contadores) y precio pactado; se configuran aquí, cliente por cliente. */}
        <div className={spanClass(plans.length, plans.length + 1)}>
        <Card className={`h-full ${accentTone("violet").card}`}>
          <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="h-2.5 w-2.5 rounded-full bg-violet-500" aria-hidden="true" /> {customPlanName(lang)}
                <Sparkles className="h-4 w-4 text-violet-400" />
              </CardTitle>
              <p className="text-xs text-slate-500">{es ? "Módulos y cantidades por cliente" : "Modules and quantities per client"} · {customClients.length} {es ? (customClients.length === 1 ? "cliente" : "clientes") : customClients.length === 1 ? "client" : "clients"}</p>
            </div>
            <CustomPlanDialog clients={allClients} plans={plans} lang={lang} />
          </CardHeader>
          {/* A todo el ancho (cuando va sola en su fila) el texto queda a la izquierda y los clientes a la derecha. */}
          <CardContent className={wideCustom ? "space-y-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-8 lg:space-y-0" : "space-y-4"}>
            <div className="space-y-4">
              <p className="text-3xl font-bold text-slate-900">{es ? "Precio pactado" : "Agreed price"}</p>
              <p className="text-sm text-slate-600">
                {es
                  ? "Para negocios con condiciones propias. Enciendes con interruptores los módulos que contrata cada cliente y fijas con contadores cuántos usuarios, leads, automatizaciones y agentes IA incluye, además de su presupuesto de IA y su precio mensual. No cambia al editar los planes de arriba."
                  : "For businesses with their own terms. Turn on each client's modules with switches and set with counters how many users, leads, automations and AI agents it includes, plus its AI budget and monthly price. Editing the plans above doesn't change it."}
              </p>
            </div>
            <div>
              {customClients.length === 0 ? (
                <p className="text-sm text-slate-400">{es ? "Aún no hay clientes A la medida." : "No Custom Service clients yet."}</p>
              ) : (
                <ul className="divide-y divide-violet-100 rounded-lg border border-violet-100 bg-white/60">
                  {customClients.map((c) => (
                    <li key={c.id} className="space-y-1.5 px-3 py-2.5 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <Link href={`/admin/clients/${c.id}`} className="min-w-0 truncate font-medium text-slate-900 hover:underline">{c.name}</Link>
                        <span className="flex flex-shrink-0 items-center gap-2">
                          <span className="font-semibold text-slate-900">${c.priceMxn.toLocaleString("en-US")} MXN</span>
                          <CustomPlanDialog orgId={c.id} plans={plans} lang={lang} />
                        </span>
                      </div>
                      {c.customPlan ? (
                        <p className="text-xs text-slate-500">
                          {[
                            limit(c.limits.users, es ? "usuario" : "user", es ? "usuarios" : "users", es ? "usuarios ilimitados" : "unlimited users"),
                            limit(c.limits.leads, "lead", "leads", es ? "leads ilimitados" : "unlimited leads"),
                            c.modules.includes("AUTOMATIONS") ? limit(c.limits.automations, es ? "automatización" : "automation", es ? "automatizaciones" : "automations", es ? "automatizaciones ilimitadas" : "unlimited automations") : null,
                            c.modules.includes("AI_WHATSAPP") ? limit(c.limits.aiAgents, es ? "agente IA" : "AI agent", es ? "agentes IA" : "AI agents", es ? "agentes IA sin tope" : "no AI agent cap") : null,
                          ].filter(Boolean).join(" · ")}
                          {" · "}{c.modules.map((m) => moduleLabel[m]).join(", ") || (es ? "sin módulos" : "no modules")}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-700">{es ? `Solo precio pactado sobre ${c.planName} (lista $${c.listPriceMxn.toLocaleString("en-US")}). Configúralo para darle módulos y cantidades propios.` : `Agreed price only on ${c.planName} (list $${c.listPriceMxn.toLocaleString("en-US")}). Configure it to give it its own modules and quantities.`}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
