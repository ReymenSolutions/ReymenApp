"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowUpRight, Loader2, Mail, Phone, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LeadTagsEditor } from "@/components/portal/LeadTagsEditor";
import { LeadTimeline } from "@/components/portal/LeadTimeline";
import { LeadAgentActions } from "@/components/portal/LeadAgentActions";
import { usePreferences } from "@/context/preferences";
import { getLeadPanel, type LeadPanelData } from "@/actions/lead-panel";
import { createNote } from "@/actions/notes";
import { moveOpportunityStage } from "@/actions/opportunities";
import { updateLeadStatus } from "@/actions/leads";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getErrorMessage } from "@/lib/user-error";
import type { LeadStatus } from "@prisma/client";

const COPY = {
  es: {
    description: "Detalle del contacto",
    open: "Abrir ficha completa",
    loadError: "No se pudo cargar el contacto",
    retry: "Reintentar",
    contact: "Contacto",
    status: "Estado",
    source: "Fuente",
    since: "Desde",
    tags: "Etiquetas",
    opportunities: "Oportunidades",
    noOpps: "Sin oportunidades",
    activity: "Actividad",
    notePlaceholder: "Agrega una nota…",
    add: "Agregar",
    saving: "Guardando…",
    noteSaved: "Nota guardada",
    noteError: "No se pudo guardar la nota. Tu texto se conserva.",
    you: "Tú",
    moveError: "No se pudo mover la oportunidad",
    statusError: "No se pudo cambiar el estado",
    statusSaved: "Estado actualizado",
    close: "Cerrar",
    stage: "Etapa",
    doNotContact: "No contactar",
  },
  en: {
    description: "Contact details",
    open: "Open full profile",
    loadError: "Couldn't load the contact",
    retry: "Retry",
    contact: "Contact",
    status: "Status",
    source: "Source",
    since: "Since",
    tags: "Tags",
    opportunities: "Opportunities",
    noOpps: "No opportunities",
    activity: "Activity",
    notePlaceholder: "Add a note…",
    add: "Add",
    saving: "Saving…",
    noteSaved: "Note saved",
    noteError: "Couldn't save the note. Your text is kept.",
    you: "You",
    moveError: "Couldn't move the opportunity",
    statusError: "Couldn't change the status",
    statusSaved: "Status updated",
    close: "Close",
    stage: "Stage",
    doNotContact: "Do not contact",
  },
};

const STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/**
 * Panel lateral del detalle de un contacto (se abre desde el pipeline y la tabla de leads). Es un diálogo
 * accesible: Escape y clic fuera lo cierran, el foco queda dentro y regresa al elemento que lo abrió.
 */
export function LeadDetailPanel({ leadId, onClose, returnFocusRef }: { leadId: string | null; onClose: () => void; returnFocusRef?: React.RefObject<HTMLElement | null> }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  // Se conserva el último contacto mientras el panel hace su animación de salida.
  const [shownId, setShownId] = useState<string | null>(leadId);
  if (leadId && leadId !== shownId) setShownId(leadId);

  return (
    <Sheet open={leadId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        closeLabel={t.close}
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          // Al cerrar, el foco regresa al elemento que abrió el panel (tarjeta o fila).
          const target = returnFocusRef?.current;
          if (target && target.isConnected) {
            e.preventDefault();
            target.focus();
          }
        }}
      >
        {shownId && <PanelBody key={shownId} leadId={shownId} />}
      </SheetContent>
    </Sheet>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex-1 space-y-6 p-5" aria-busy="true">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <div className="space-y-2.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-5/6" />
        <Skeleton className="h-3.5 w-2/3" />
      </div>
      <Skeleton className="h-20 w-full rounded-card" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-2.5">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelBody({ leadId }: { leadId: string }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const [data, setData] = useState<LeadPanelData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Cada carga nueva (por ejemplo tras deshacer algo del agente) vuelve a montar el contenido con los datos frescos.
  const [version, setVersion] = useState(0);
  // Los eventos con fecha posterior a la apertura del panel (las notas nuevas) entran con animación.
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    getLeadPanel(leadId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setVersion((v) => v + 1);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [leadId, attempt]);

  if (failed && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <SheetTitle>{t.loadError}</SheetTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> {t.retry}
        </Button>
      </div>
    );
  }
  if (!data) {
    return (
      <>
        <SheetTitle className="sr-only">{t.description}</SheetTitle>
        <PanelSkeleton />
      </>
    );
  }
  return <PanelContent key={version} data={data} openedAt={openedAt} onReload={() => setAttempt((n) => n + 1)} />;
}

function PanelContent({ data, openedAt, onReload }: { data: LeadPanelData; openedAt: number; onReload: () => void }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const { lead } = data;
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [opps, setOpps] = useState(data.opportunities);
  const [events, setEvents] = useState(data.timeline.events);
  const [note, setNote] = useState("");
  const [saving, startSaving] = useTransition();
  const noteRef = useRef<HTMLTextAreaElement>(null);

  function addNote() {
    const content = note.trim();
    if (!content || saving) return;
    startSaving(async () => {
      try {
        await createNote({ leadId: lead.id, content });
        setEvents((prev) => [{ type: "note", date: new Date(), content, authorName: data.me || t.you }, ...prev]);
        setNote("");
        toast.success(t.noteSaved);
      } catch (e) {
        // El texto se queda en el cuadro para poder reintentar.
        toast.error(t.noteError, { description: getErrorMessage(e, "") || undefined });
        noteRef.current?.focus();
      }
    });
  }

  async function changeStatus(next: LeadStatus) {
    const prev = status;
    if (next === prev) return;
    setStatus(next);
    try {
      await updateLeadStatus(lead.id, next);
      toast.success(t.statusSaved);
    } catch (e) {
      setStatus(prev);
      toast.error(t.statusError, { description: getErrorMessage(e, "") || undefined });
    }
  }

  async function changeStage(oppId: string, stageId: string) {
    const target = data.stages.find((s) => s.id === stageId);
    const before = opps;
    if (!target) return;
    setOpps((list) => list.map((o) => (o.id === oppId ? { ...o, stageId, stageName: target.name } : o)));
    try {
      await moveOpportunityStage(oppId, stageId);
    } catch (e) {
      setOpps(before);
      toast.error(t.moveError, { description: getErrorMessage(e, "") || undefined });
    }
  }

  return (
    <>
      <header className="border-b border-slate-100 p-5 pr-12">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">{initials(lead.name) || "?"}</div>
          <div className="min-w-0">
            <SheetTitle className="truncate">{lead.name}</SheetTitle>
            <SheetDescription className="mt-0.5">{t.description}</SheetDescription>
          </div>
        </div>
        <Link href={`/portal/leads/${lead.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
          {t.open} <ArrowUpRight className="h-3 w-3" />
        </Link>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto p-5">
        <section aria-label={t.contact} className="space-y-2.5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500">{t.status}</span>
            {data.canUpdateStatus ? (
              <Select value={status} onValueChange={(v) => changeStatus(v as LeadStatus)}>
                <SelectTrigger className="h-8 w-40 text-xs" aria-label={t.status}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      <StatusBadge status={s} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <StatusBadge status={status} />
            )}
          </div>
          {lead.email && (
            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-slate-700 hover:text-brand-700">
              <Mail className="h-4 w-4 text-slate-400" /> <span className="truncate">{lead.email}</span>
            </a>
          )}
          {lead.phone && (
            <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-slate-700 hover:text-brand-700">
              <Phone className="h-4 w-4 text-slate-400" /> {lead.phone}
            </a>
          )}
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              {t.source}: <span className="font-medium text-slate-700">{lead.source ?? "manual"}</span>
            </span>
            <span>
              {t.since} {formatDate(lead.createdAt)}
            </span>
          </div>
          {lead.doNotContact && <p className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">{t.doNotContact}</p>}
        </section>

        <section aria-label={t.tags}>
          <LeadTagsEditor leadId={lead.id} initialTags={lead.tags} />
        </section>

        <LeadAgentActions actions={data.aiActions} canManage={data.canManageOpps} onChanged={onReload} />

        <section aria-label={t.opportunities} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.opportunities}</h3>
          {opps.length === 0 ? (
            <p className="text-xs text-slate-400">{t.noOpps}</p>
          ) : (
            opps.map((o) => (
              <div key={o.id} className="rounded-card border border-slate-200 p-3 shadow-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{o.title}</p>
                    <p className="text-xs text-slate-500">
                      {o.ownerName ?? "—"}
                      {o.estimatedCloseDate ? ` · ${formatDate(o.estimatedCloseDate)}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">{o.amount != null ? formatCurrency(o.amount, o.currency) : "—"}</span>
                </div>
                {data.canManageOpps ? (
                  <Select value={o.stageId} onValueChange={(v) => changeStage(o.id, v)}>
                    <SelectTrigger className="mt-2 h-7 text-xs" aria-label={`${t.stage}: ${o.title}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.stages.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">{o.stageName}</p>
                )}
              </div>
            ))
          )}
        </section>

        <section aria-label={t.activity} className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.activity}</h3>
          <div className="space-y-2">
            <Textarea
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addNote();
              }}
              placeholder={t.notePlaceholder}
              aria-label={t.notePlaceholder}
              className="min-h-[64px] text-sm"
              disabled={saving}
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={addNote} disabled={saving || !note.trim()}>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {saving ? t.saving : t.add}
              </Button>
            </div>
          </div>
          <LeadTimeline events={events} hasMore={data.timeline.hasMore} moreHref={`/portal/leads/${lead.id}`} lang={lang === "en" ? "en" : "es"} animateAfter={openedAt} />
        </section>
      </div>
    </>
  );
}
