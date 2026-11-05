import Link from "next/link";
import type { Prisma, AutomationStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { AutomationsManager } from "@/components/admin/AutomationsManager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getModuleLabel } from "@/lib/modules";
import { listBlueprints } from "@/lib/automation/blueprints";
import { blueprintsCovering } from "@/lib/automation/coverage";
import { getServerLang } from "@/lib/i18n-server";

const CATEGORY_LABELS = {
  es: { onboarding: "Bienvenida", retention: "Retención", follow_up: "Seguimiento", notifications: "Avisos y reportes", lead_capture: "Captura de leads", appointments: "Agendamiento", crm: "CRM" } as Record<string, string>,
  en: { onboarding: "Welcome", retention: "Retention", follow_up: "Follow-up", notifications: "Alerts & reports", lead_capture: "Lead capture", appointments: "Appointments", crm: "CRM" } as Record<string, string>,
};

async function getData(filters: { q: string; client: string; status: string; page: number }) {
  const where: Prisma.AutomationWhereInput = { blueprintKey: null, ...(filters.q ? { OR: [{ name: { contains: filters.q, mode: "insensitive" } }, { organization: { name: { contains: filters.q, mode: "insensitive" } } }] } : {}), ...(filters.client ? { organizationId: filters.client } : {}), ...(filters.status ? { status: filters.status as AutomationStatus } : { status: { not: "ARCHIVED" } }) };
  const total = await prisma.automation.count({ where });
  const page = Math.min(filters.page, Math.max(1, Math.ceil(total / 20)));
  const [automations, orgs, blueprintInstances, templates] = await Promise.all([
    prisma.automation.findMany({
      where, skip: (page - 1) * 20, take: 20,
      orderBy: { createdAt: "desc" },
      include: { organization: { select: { name: true, slug: true } }, _count: { select: { events: true } } },
    }),
    prisma.organization.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, modules: { where: { module: "AUTOMATIONS", status: "ACTIVE" }, select: { id: true } } } }),
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
  return { automations, orgs, blueprintInstances, templates, total, page };
}

type CatalogItem =
  | { kind: "blueprint"; key: string; name: string; description: string; category: string; meta: string; instances: { orgId: string; orgName: string; state: "paused" | "dry" | "live" }[] }
  | { kind: "template"; key: string; name: string; description: string; category: string; meta: string; installs: number; coveredBy: string[] };

export default async function AdminAutomationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const filters = { q: value("q").slice(0, 100), client: value("client"), status: ["ACTIVE", "PAUSED", "ERROR", "ARCHIVED"].includes(value("status")) ? value("status") : "", page: Math.max(1, Math.min(100000, Number.parseInt(value("page"), 10) || 1)) };
  const [{ automations, orgs, blueprintInstances, templates, total, page }, lang] = await Promise.all([getData(filters), getServerLang()]);
  const pageUrl = (n: number) => `/admin/automations?${new URLSearchParams({ q: filters.q, client: filters.client, status: filters.status, page: String(n) })}`;
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
    ...templates.map((tpl): CatalogItem => ({ kind: "template", key: `tpl:${tpl.id}`, name: `${tpl.iconEmoji} ${tpl.name}`, description: tpl.description, category: tpl.category, meta: `${es ? "Industria" : "Industry"}: ${tpl.industry}`, installs: tpl._count.installations, coveredBy: blueprintsCovering(tpl.category).map((b) => b.name) })),
  ];
  const categories = [...new Set(items.map((i) => i.category))].sort((a, b) => (labels[a] ?? a).localeCompare(labels[b] ?? b));

  const usage = await prisma.automationUsage.groupBy({ by: ["state"], where: { period: new Date().toISOString().slice(0, 7), ...(filters.client ? { organizationId: filters.client } : {}) }, _count: { _all: true } });
  const usageCount = (state: string) => usage.find(row => row.state === state)?._count._all ?? 0;
  const stateLabel = { paused: es ? "pausada" : "paused", dry: es ? "simulación" : "dry-run", live: es ? "envío real" : "live" };

  return (
    <div className="space-y-6">
      <section aria-label={es ? "Operación diaria" : "Daily operations"} className="space-y-4">
        <h1 className="text-xl font-semibold">{es ? "Centro de automatizaciones" : "Automation center"}</h1>
        <p className="text-sm text-slate-500">{es ? "Encuentra un cliente, revisa errores y administra sus automatizaciones. Consulta el catálogo para ofrecer nuevos servicios." : "Find a client, review failures and manage their automations. Browse the catalog to offer new services."}</p>
        <div className="grid grid-cols-2 gap-3"><Card><CardContent className="p-4"><p className="text-sm text-slate-500">{es ? "Ejecuciones exitosas del mes" : "Successful runs this month"}</p><p className="text-2xl font-semibold">{usageCount("SUCCEEDED")}</p></CardContent></Card><Card><CardContent className="p-4"><p className="text-sm text-slate-500">{es ? "Reservadas / por confirmar" : "Reserved / awaiting confirmation"}</p><p className="text-2xl font-semibold">{usageCount("RESERVED")}</p></CardContent></Card></div><p className="text-xs text-slate-500">{es ? "Mes calendario UTC. Solo ejecuciones con reserva; los workflows externos deben integrar el control de cuota." : "UTC calendar month. Reserved runs only; external workflows must integrate quota admission."}</p>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">{es ? "Buscar" : "Search"}<input name="q" defaultValue={filters.q} placeholder={es ? "Nombre o cliente" : "Name or client"} className="mt-1 w-full rounded-md border border-slate-300 bg-transparent p-2" /></label>
          <label className="text-sm">{es ? "Cliente" : "Client"}<select name="client" defaultValue={filters.client} className="mt-1 w-full rounded-md border border-slate-300 bg-transparent p-2"><option value="">{es ? "Todos" : "All"}</option>{orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label className="text-sm">{es ? "Estado" : "Status"}<select name="status" defaultValue={filters.status} className="mt-1 w-full rounded-md border border-slate-300 bg-transparent p-2"><option value="">{es ? "Sin archivadas" : "Not archived"}</option>{["ACTIVE", "PAUSED", "ERROR", "ARCHIVED"].map((state, index) => <option key={state} value={state}>{(es ? ["Activas", "Pausadas", "Con errores", "Archivadas"] : ["Active", "Paused", "Errors", "Archived"])[index]}</option>)}</select></label>
          <div className="flex items-end gap-3"><button className="rounded-md bg-brand-600 px-4 py-2 text-white" type="submit">{es ? "Filtrar" : "Filter"}</button><Link href="/admin/automations" className="py-2 text-sm underline">{es ? "Limpiar" : "Clear"}</Link></div>
        </form>
        <AutomationsManager automations={automations} orgs={orgs.filter(o => o.modules.length > 0)} filtered={!!(filters.q || filters.client || filters.status)} />
        <nav aria-label={es ? "Paginación" : "Pagination"} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{total} {es ? "resultados" : "results"} · {page} / {Math.max(1, Math.ceil(total / 20))}</span><div className="flex gap-4">{page > 1 && <Link href={pageUrl(page - 1)}>{es ? "Anterior" : "Previous"}</Link>}{page * 20 < total && <Link href={pageUrl(page + 1)}>{es ? "Siguiente" : "Next"}</Link>}</div></nav>
      </section>
      <details className="rounded-lg border border-slate-200 p-4">
      <summary className="cursor-pointer font-semibold">{es ? "Explorar catálogo y programas por cliente" : "Browse catalog and client programs"}</summary>
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
                            {(() => {
                              const n = item.kind === "blueprint" ? item.instances.length : item.installs;
                              return `${n} ${es ? (n === 1 ? "cliente" : "clientes") : n === 1 ? "client" : "clients"}`;
                            })()}
                          </Badge>
                        </div>
                      </div>
                      {item.kind === "blueprint" && item.instances.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.instances.map((i) => (
                            <Link key={i.orgId} href={`/admin/clients/${i.orgId}/automations`} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 hover:bg-slate-200">
                              {i.orgName} · {stateLabel[i.state]}
                            </Link>
                          ))}
                        </div>
                      )}
                      {item.kind === "template" && item.coveredBy.length > 0 && (
                        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                          {es ? `Esta plantilla decide a quién escribir y ya existe como blueprint (${item.coveredBy.join(", ")}). Para clientes con Reymen POS usa el blueprint —con simulación, consentimiento y enfriamiento—; la plantilla queda para quien no lo tiene.` : `This template decides whom to message and already exists as a blueprint (${item.coveredBy.join(", ")}). For clients with Reymen POS use the blueprint —with simulation, consent and cooldown—; the template is for those without it.`}
                        </p>
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

      </details>
    </div>
  );
}
