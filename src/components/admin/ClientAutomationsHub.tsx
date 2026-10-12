"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight, ListChecks, Loader2, Search, Settings2, Sparkles, Workflow, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { AutomationConfigDialog } from "@/components/admin/AutomationConfigDialog";
import { enableBlueprint, setBlueprintDryRun, disableBlueprint, type BlueprintRow } from "@/actions/admin/blueprints";
import { usePreferences } from "@/context/preferences";
import { getErrorMessage } from "@/lib/user-error";
import { matchesSearch } from "@/lib/search-text";
import { cn } from "@/lib/utils";

/** Una automatización heredada (plantilla n8n o creada a mano) de este cliente. */
export type LegacyAutomationRow = { id: string; name: string; type: string; status: string; n8nWorkflowId: string | null; lastRunAt: string | null; configurable: boolean };

type State = "LIVE" | "DRY_RUN" | "PAUSED" | "NOT_ENABLED" | "ERROR" | "ARCHIVED";
type Item = {
  id: string;
  kind: "blueprint" | "template";
  name: string;
  category: string;
  description: string | null;
  state: State;
  lastRunAt: string | null;
  blueprint?: BlueprintRow;
  legacy?: LegacyAutomationRow;
};

const PAGE_SIZE = 8;

const COPY = {
  es: {
    title: "Automatizaciones",
    intro: "Todo lo que automatiza este cliente en un solo lugar. Las inteligentes (blueprints) nacen en simulación: registran a quién se habría contactado, sin enviar nada.",
    search: "Buscar por nombre, tipo o descripción…",
    tabs: { all: "Todas", blueprint: "Inteligentes", template: "Plantillas n8n" },
    state: { LIVE: "Activa", DRY_RUN: "Simulación", PAUSED: "Pausada", NOT_ENABLED: "Sin habilitar", ERROR: "Con error", ARCHIVED: "Archivada" } as Record<State, string>,
    stateLabel: "Estado",
    typeLabel: "Tipo o disparador",
    allStates: "Todos",
    allTypes: "Todos",
    searchLabel: "Buscar",
    noResults: "Sin resultados",
    clear: "Limpiar filtros",
    clearSearch: "Borrar búsqueda",
    nothing: "Ninguna automatización coincide con tu búsqueda.",
    empty: "Este cliente aún no tiene automatizaciones.",
    shown: (from: number, to: number, total: number) => `${from}–${to} de ${total}`,
    prev: "Anterior",
    next: "Siguiente",
    enable: "Habilitar",
    resume: "Reanudar",
    pause: "Pausar",
    configure: "Configurar",
    details: "Detalles",
    executions: "Ver ejecuciones y errores",
    toLive: "Pasar a envío real",
    toDry: "Volver a simulación",
    confirmLive: "¿Pasar a envío real? Solo hazlo si el negocio ya tiene su aviso de privacidad y el canal de envío conectado.",
    overlapWarn: (names: string) => `Este cliente ya tiene instalada la plantilla de n8n «${names}», que hace un trabajo parecido. Con las dos en envío real el cliente podría recibir mensajes duplicados.`,
    overlapConfirm: "¿Confirmas que no se duplicarán (por ejemplo, ya desactivaste la plantilla)?",
    needs: "Requiere",
    trigger: "Se dispara con",
    last: "Última ejecución",
    never: "Aún sin ejecuciones",
    workflow: "Workflow n8n",
    kindBlueprint: "Inteligente",
    kindTemplate: "Plantilla n8n",
    error: "No se pudo completar",
    status: { DRY_RUN: "simuladas", SKIPPED: "omitidas", PENDING: "pendientes", DISPATCHED: "enviadas", SUCCEEDED: "exitosas", FAILED: "fallidas" } as Record<string, string>,
    count: (n: number) => `${n} en total`,
  },
  en: {
    title: "Automations",
    intro: "Everything this client automates in one place. Smart ones (blueprints) start in simulation: they log who would have been contacted, without sending anything.",
    search: "Search by name, type or description…",
    tabs: { all: "All", blueprint: "Smart", template: "n8n templates" },
    state: { LIVE: "Active", DRY_RUN: "Simulation", PAUSED: "Paused", NOT_ENABLED: "Not enabled", ERROR: "Error", ARCHIVED: "Archived" } as Record<State, string>,
    stateLabel: "Status",
    typeLabel: "Type or trigger",
    allStates: "All",
    allTypes: "All",
    searchLabel: "Search",
    noResults: "No results",
    clear: "Clear filters",
    clearSearch: "Clear search",
    nothing: "No automation matches your search.",
    empty: "This client has no automations yet.",
    shown: (from: number, to: number, total: number) => `${from}–${to} of ${total}`,
    prev: "Previous",
    next: "Next",
    enable: "Enable",
    resume: "Resume",
    pause: "Pause",
    configure: "Configure",
    details: "Details",
    executions: "View executions and errors",
    toLive: "Switch to live sending",
    toDry: "Back to simulation",
    confirmLive: "Switch to live sending? Only do this if the business already has its privacy notice and the sending channel connected.",
    overlapWarn: (names: string) => `This client already has the n8n template “${names}” installed, which does a similar job. With both live the customer could get duplicate messages.`,
    overlapConfirm: "Do you confirm they will not be duplicated (e.g. you already turned the template off)?",
    needs: "Requires",
    trigger: "Triggered by",
    last: "Last run",
    never: "No runs yet",
    workflow: "n8n workflow",
    kindBlueprint: "Smart",
    kindTemplate: "n8n template",
    error: "Couldn't complete",
    status: { DRY_RUN: "simulated", SKIPPED: "skipped", PENDING: "pending", DISPATCHED: "sent", SUCCEEDED: "succeeded", FAILED: "failed" } as Record<string, string>,
    count: (n: number) => `${n} total`,
  },
};

const STATE_VARIANT: Record<State, "success" | "secondary" | "warning" | "destructive" | "outline"> = { LIVE: "success", DRY_RUN: "warning", PAUSED: "secondary", NOT_ENABLED: "outline", ERROR: "destructive", ARCHIVED: "outline" };

function blueprintState(b: BlueprintRow): State {
  if (!b.instance) return "NOT_ENABLED";
  if (b.instance.status !== "ACTIVE") return "PAUSED";
  return b.instance.dryRun ? "DRY_RUN" : "LIVE";
}
function legacyState(a: LegacyAutomationRow): State {
  return a.status === "ACTIVE" ? "LIVE" : a.status === "ERROR" ? "ERROR" : a.status === "ARCHIVED" ? "ARCHIVED" : "PAUSED";
}

/**
 * Automatizaciones de un cliente (inteligentes y plantillas n8n) en una lista compacta: una fila por automatización con su
 * estado y su acción principal; el detalle y las acciones secundarias se despliegan. Con búsqueda por texto, pestañas,
 * filtros (estado y tipo, este último también con búsqueda) y paginación, para que escale cuando crezca.
 */
export function ClientAutomationsHub({ orgId, blueprints, legacy }: { orgId: string; blueprints: BlueprintRow[]; legacy: LegacyAutomationRow[] }) {
  const { lang } = usePreferences();
  const es = lang !== "en";
  const t = COPY[es ? "es" : "en"];
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "blueprint" | "template">("all");
  const [stateFilter, setStateFilter] = useState<State | "">("");
  const [typeFilter, setTypeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const items = useMemo<Item[]>(
    () => [
      ...blueprints.map<Item>((b) => ({ id: b.key, kind: "blueprint", name: b.name, category: b.trigger, description: b.description, state: blueprintState(b), lastRunAt: b.instance?.lastRunAt ?? null, blueprint: b })),
      ...legacy.map<Item>((a) => ({ id: a.id, kind: "template", name: a.name, category: a.type, description: null, state: legacyState(a), lastRunAt: a.lastRunAt, legacy: a })),
    ],
    [blueprints, legacy],
  );

  const typeOptions = useMemo(() => [...new Set(items.map((i) => i.category))].sort().map((c) => ({ value: c, label: c })), [items]);
  const counts = useMemo(() => ({ all: items.length, blueprint: items.filter((i) => i.kind === "blueprint").length, template: items.filter((i) => i.kind === "template").length }), [items]);
  const filtered = useMemo(
    () => items.filter((i) => (tab === "all" || i.kind === tab) && (!stateFilter || i.state === stateFilter) && (!typeFilter || i.category === typeFilter) && matchesSearch(query, i.name, i.category, i.description, t.state[i.state])),
    [items, tab, stateFilter, typeFilter, query, t],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const hasFilters = !!query || !!stateFilter || !!typeFilter || tab !== "all";
  const reset = () => { setQuery(""); setStateFilter(""); setTypeFilter(""); setTab("all"); setPage(1); };
  const stateOptions = (Object.keys(t.state) as State[]).map((s) => ({ value: s, label: t.state[s] }));

  function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    startTransition(async () => {
      try {
        await fn();
      } catch (err) {
        toast.error(getErrorMessage(err, t.error));
      } finally {
        setBusy(null);
      }
    });
  }

  function toggleDry(b: BlueprintRow) {
    const inst = b.instance!;
    if (inst.dryRun && !window.confirm(t.confirmLive)) return;
    // Con una plantilla n8n parecida activa, pasar a envío real exige confirmar que no se duplicará.
    const acknowledgeOverlap = inst.dryRun && b.overlaps.length > 0;
    if (acknowledgeOverlap && !window.confirm(`${t.overlapWarn(b.overlaps.map((o) => o.templateName).join(", "))}\n\n${t.overlapConfirm}`)) return;
    run(b.key, () => setBlueprintDryRun({ orgId, automationId: inst.id, dryRun: !inst.dryRun, acknowledgeOverlap }));
  }

  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(es ? "es-MX" : "en-US", { dateStyle: "medium", timeStyle: "short" }) : null);

  return (
    <Card id="blueprints" className="lg:col-span-2 scroll-mt-20">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Workflow className="h-4 w-4" /> {t.title}
          <span className="text-xs font-normal text-slate-500">{t.count(counts.all)}</span>
          <Link href={`/admin/clients/${orgId}/automations`} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
            <ListChecks className="h-3.5 w-3.5" /> {t.executions}
          </Link>
        </CardTitle>
        <p className="text-sm text-slate-500">{t.intro}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Pestañas */}
        <div role="tablist" aria-label={t.title} className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {(["all", "blueprint", "template"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => { setTab(k); setPage(1); }} className={cn("rounded-md px-3 py-1.5 font-medium transition-colors", tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
              {t.tabs[k]} <span className="ml-1 text-xs text-slate-400">{counts[k]}</span>
            </button>
          ))}
        </div>

        {/* Búsqueda y filtros */}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_14rem]">
          <div>
            <label htmlFor="auto-search" className="mb-1 block text-xs font-medium text-slate-600">{t.searchLabel}</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input id="auto-search" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder={t.search} className="h-9 w-full rounded-md border border-slate-200 bg-transparent pl-8 pr-8 text-sm outline-none focus:border-brand-500" />
              {query && (
                <button type="button" aria-label={t.clearSearch} onClick={() => setQuery("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <SearchableSelect label={t.stateLabel} options={stateOptions} value={stateFilter} onChange={(v) => { setStateFilter(v as State | ""); setPage(1); }} allLabel={t.allStates} noResults={t.noResults} />
          <SearchableSelect label={t.typeLabel} options={typeOptions} value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} allLabel={t.allTypes} noResults={t.noResults} />
        </div>

        {/* Lista */}
        {visible.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-500">{items.length === 0 ? t.empty : t.nothing}</p>
            {hasFilters && <Button size="sm" variant="outline" className="mt-3" onClick={reset}>{t.clear}</Button>}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {visible.map((item) => {
              const expanded = open === item.id;
              const b = item.blueprint;
              const inst = b?.instance ?? null;
              const key = `${item.kind}:${item.id}`;
              const rowBusy = busy === item.id || busy === b?.key;
              return (
                <li key={key} className="bg-white">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
                    <button type="button" onClick={() => setOpen(expanded ? null : item.id)} aria-expanded={expanded} aria-label={`${t.details}: ${item.name}`} className="flex min-w-0 basis-full items-center gap-3 text-left sm:basis-0 sm:flex-1">
                      <span className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg", item.kind === "blueprint" ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-600")}>
                        {item.kind === "blueprint" ? <Sparkles className="h-4 w-4" /> : <Workflow className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">{item.name}</span>
                        <span className="block truncate text-xs text-slate-500">{item.kind === "blueprint" ? t.kindBlueprint : t.kindTemplate} · {item.category}</span>
                      </span>
                      <ChevronDown className={cn("ml-auto h-4 w-4 flex-shrink-0 text-slate-400 transition-transform", expanded && "rotate-180")} />
                    </button>
                    {/* En pantallas chicas el estado y la acción van en su propia línea, para que el nombre se lea completo. */}
                    <div className="flex w-full flex-shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
                    <Badge variant={STATE_VARIANT[item.state]} className="w-24 flex-shrink-0 justify-center">{t.state[item.state]}</Badge>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {b && !inst && (
                        <Button size="sm" disabled={pending} onClick={() => run(b.key, () => enableBlueprint({ orgId, key: b.key }))}>
                          {rowBusy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} {t.enable}
                        </Button>
                      )}
                      {b && inst && (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfiguring(inst.id)}>
                          <Settings2 className="mr-1 h-3 w-3" /> {t.configure}
                        </Button>
                      )}
                      {item.legacy?.configurable && (
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfiguring(item.legacy!.id)}>
                          <Settings2 className="mr-1 h-3 w-3" /> {t.configure}
                        </Button>
                      )}
                    </div>
                    </div>
                  </div>

                  {expanded && (
                    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-3 py-3 text-sm sm:px-4">
                      {b && <p className="text-slate-600">{b.description}</p>}
                      {b && (
                        <dl className="grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">
                          <div><dt className="inline font-medium text-slate-600">{t.needs}: </dt><dd className="inline">{b.requiredModules.join(", ")}</dd></div>
                          <div><dt className="inline font-medium text-slate-600">{t.trigger}: </dt><dd className="inline">{b.trigger}</dd></div>
                        </dl>
                      )}
                      {item.legacy?.n8nWorkflowId && <p className="text-xs text-slate-500"><span className="font-medium text-slate-600">{t.workflow}: </span>{item.legacy.n8nWorkflowId}</p>}
                      {b && b.overlaps.length > 0 && <p role="note" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{t.overlapWarn(b.overlaps.map((o) => o.templateName).join(", "))}</p>}
                      <p className="text-xs text-slate-500">
                        <span className="font-medium text-slate-600">{t.last}: </span>
                        {when(item.lastRunAt) ?? t.never}
                        {inst && Object.keys(inst.counts).length > 0 && ` — ${Object.entries(inst.counts).map(([s, n]) => `${n} ${t.status[s] ?? s}`).join(" · ")}`}
                      </p>
                      {b && inst && (
                        <div className="flex flex-wrap gap-2">
                          {inst.status === "ACTIVE" ? (
                            <>
                              <Button size="sm" variant="outline" disabled={pending} onClick={() => toggleDry(b)}>{inst.dryRun ? t.toLive : t.toDry}</Button>
                              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(b.key, () => disableBlueprint({ orgId, automationId: inst.id }))}>{t.pause}</Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(b.key, () => enableBlueprint({ orgId, key: b.key }))}>{t.resume}</Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{t.shown((current - 1) * PAGE_SIZE + 1, Math.min(current * PAGE_SIZE, filtered.length), filtered.length)}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label={t.prev}><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="outline" disabled={current >= pages} onClick={() => setPage(current + 1)} aria-label={t.next}><ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
      </CardContent>
      <AutomationConfigDialog orgId={orgId} automationId={configuring} onClose={() => setConfiguring(null)} />
    </Card>
  );
}
