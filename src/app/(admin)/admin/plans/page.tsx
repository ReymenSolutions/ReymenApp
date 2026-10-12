import { Layers3 } from "lucide-react";
import { getServerLang } from "@/lib/i18n-server";
import { listPlansForAdmin } from "@/actions/admin/plans";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlanEditorDialog } from "@/components/admin/PlanEditorDialog";
import { getModuleLabel } from "@/lib/modules";
import { planDescription, planName } from "@/lib/plans";
import { formatDateTime } from "@/lib/utils";

/** Admin → Planes: el catálogo comercial. Lo que se edita aquí es lo que ven y usan todas las pantallas y reglas conectadas. */
export default async function AdminPlansPage() {
  const es = (await getServerLang()) === "es";
  const lang = es ? "es" : "en";
  const plans = await listPlansForAdmin();
  const moduleLabel = getModuleLabel(lang);
  const limit = (n: number | null, one: string, many: string, unlimited: string) => (n === null ? unlimited : `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`);

  return (
    <div className="space-y-6">
      <PageHeader
        title={es ? "Planes" : "Plans"}
        description={es ? "Nombre, precio, límites, presupuesto de IA y qué incluye cada plan. Al guardar, el cambio se aplica de inmediato en Configuración del cliente, Cambiar plan, ROI, límites, presupuesto de IA, módulos y métricas." : "Name, price, limits, AI budget and what each plan includes. On save, the change applies immediately in client Settings, Change plan, ROI, limits, AI budget, modules and metrics."}
        actions={<PlanEditorDialog />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.key} className={p.isActive ? "" : "opacity-70"}>
            <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Layers3 className="h-4 w-4 text-slate-400" /> {planName(p, lang)}
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
                  {es ? "Último cambio" : "Last change"}: v{p.revisions[0].version} · {p.revisions[0].changedBy ?? (es ? "sistema" : "system")} · {formatDateTime(p.revisions[0].createdAt)}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
