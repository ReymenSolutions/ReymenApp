import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AutomationsManager } from "@/components/admin/AutomationsManager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getModuleLabel } from "@/lib/modules";
import { listBlueprints } from "@/lib/automation/blueprints";
import { getServerLang } from "@/lib/i18n-server";

const CATEGORY_LABELS = {
  es: { onboarding: "Bienvenida", retention: "Retención", follow_up: "Seguimiento", notifications: "Avisos y reportes", lead_capture: "Captura de leads", appointments: "Agendamiento", crm: "CRM" } as Record<string, string>,
  en: { onboarding: "Welcome", retention: "Retention", follow_up: "Follow-up", notifications: "Alerts & reports", lead_capture: "Lead capture", appointments: "Appointments", crm: "CRM" } as Record<string, string>,
};

async function getData() {
  const [automations, orgs, blueprintInstances, templates] = await Promise.all([
    prisma.automation.findMany({
      where: { blueprintKey: null },
      orderBy: { createdAt: "desc" },
      include: { organization: { select: { name: true, slug: true } }, _count: { select: { events: true } } },
    }),
    prisma.organization.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.automation.findMany({
      where: { blueprintKey: { not: null } },
      select: { blueprintKey: true, status: true, dryRun: true, organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.automationTemplate.findMany({
      where: { isPublished: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, category: true, industry: true, iconEmoji: true, _count: { select: { installations: { where: { status: "ACTIVE" } } } } },
    }),
  ]);
  return { automations, orgs, blueprintInstances, templates };
}

type CatalogItem =
  | { kind: "blueprint"; key: string; name: string; description: string; category: string; meta: string; instances: { orgId: string; orgName: string; state: "paused" | "dry" | "live" }[] }
  | { kind: "template"; key: string; name: string; description: string; category: string; meta: string; installs: number };

export default async function AdminAutomationsPage() {
  const [{ automations, orgs, blueprintInstances, templates }, lang] = await Promise.all([getData(), getServerLang()]);
  const es = lang === "es";
  const labels = CATEGORY_LABELS[es ? "es" : "en"];
  const moduleLabel = getModuleLabel(lang);

  // Un solo catálogo: lo que corre en el código de la app (blueprints) y lo que corre en n8n (plantillas), por categoría.
  const items: CatalogItem[] = [
    ...listBlueprints().map((b): CatalogItem => ({
      kind: "blueprint",
      key: `bp:${b.key}`,
      name: b.name,
      description: b.description,
      category: b.overlapCategories?.[0] ?? "other",
      meta: `${es ? "Requiere" : "Requires"}: ${b.requiredModules.map((m) => moduleLabel[m]).join(", ")} · ${b.audience === "internal" ? (es ? "Aviso interno" : "Internal alert") : es ? "Mensaje a clientes" : "Customer message"}`,
      instances: blueprintInstances
        .filter((i) => i.blueprintKey === b.key)
        .map((i) => ({ orgId: i.organization.id, orgName: i.organization.name, state: i.status !== "ACTIVE" ? "paused" : i.dryRun ? "dry" : "live" })),
    })),
    ...templates.map((tpl): CatalogItem => ({ kind: "template", key: `tpl:${tpl.id}`, name: `${tpl.iconEmoji} ${tpl.name}`, description: tpl.description, category: tpl.category, meta: `${es ? "Industria" : "Industry"}: ${tpl.industry}`, installs: tpl._count.installations })),
  ];
  const categories = [...new Set(items.map((i) => i.category))].sort((a, b) => (labels[a] ?? a).localeCompare(labels[b] ?? b));

  const stateLabel = { paused: es ? "pausada" : "paused", dry: es ? "simulación" : "dry-run", live: es ? "envío real" : "live" };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <p className="font-semibold text-slate-900">{es ? "Catálogo de automatizaciones" : "Automation catalog"}</p>
          <p className="text-xs text-slate-500">
            {es
              ? "Todo lo que se puede ofrecer a un cliente, por categoría. Los blueprints (lógica en la app, con simulación y consentimiento) se habilitan desde el cliente: Clientes → cliente → \"Automatizaciones (blueprints)\". Las plantillas de n8n se instalan desde Plantillas. Si en una misma categoría hay de las dos, no actives ambas en el mismo cliente: se duplicarían los mensajes (el sistema avisa)."
              : "Everything that can be offered to a client, by category. Blueprints (logic in the app, with simulation and consent) are enabled from the client: Clients → client → \"Automations (blueprints)\". n8n templates are installed from Templates. If a category has both, don't enable both for the same client: messages would be duplicated (the system warns you)."}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {categories.map((category) => (
            <section key={category} aria-label={labels[category] ?? category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{labels[category] ?? (es ? "Otras" : "Other")}</h3>
              <div className="space-y-2">
                {items
                  .filter((i) => i.category === category)
                  .map((item) => (
                    <div key={item.key} className="rounded-card border border-slate-200 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900">{item.name}</p>
                          <p className="text-xs text-slate-500">{item.description}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{item.meta}</p>
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-2">
                          <Badge variant={item.kind === "blueprint" ? "info" : "secondary"}>{item.kind === "blueprint" ? (es ? "Blueprint · app" : "Blueprint · app") : es ? "Plantilla · n8n" : "Template · n8n"}</Badge>
                          <Badge variant="secondary">
                            {item.kind === "blueprint" ? item.instances.length : item.installs} {es ? "clientes" : "clients"}
                          </Badge>
                        </div>
                      </div>
                      {item.kind === "blueprint" && item.instances.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.instances.map((i) => (
                            <Link key={i.orgId} href={`/admin/clients/${i.orgId}`} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 hover:bg-slate-200">
                              {i.orgName} · {stateLabel[i.state]}
                            </Link>
                          ))}
                        </div>
                      )}
                      {item.kind === "template" && (
                        <Link href="/admin/templates" className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline">
                          {es ? "Gestionar en Plantillas" : "Manage in Templates"}
                        </Link>
                      )}
                    </div>
                  ))}
              </div>
            </section>
          ))}
        </CardContent>
      </Card>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-900">{es ? "Automatizaciones n8n instaladas" : "Installed n8n automations"}</p>
        <AutomationsManager automations={automations} orgs={orgs} />
      </div>
    </div>
  );
}
