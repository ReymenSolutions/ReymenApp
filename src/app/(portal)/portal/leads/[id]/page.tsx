import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, GitBranch, StickyNote, ArrowRightLeft, Home, Contact } from "lucide-react";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { getLeadAiActions } from "@/lib/lead-ai-actions";
import { findPotentialDuplicateLeads } from "@/lib/duplicate-detection";
import { can } from "@/lib/permissions";
import { LeadRow as Row, LeadSection as Section, LeadStat as Stat } from "@/components/portal/LeadSections";
import { LeadHeaderCard } from "@/components/portal/LeadHeaderCard";
import { LeadAgentSuggestions } from "@/components/portal/LeadAgentSuggestions";
import { LeadTagsEditor } from "@/components/portal/LeadTagsEditor";
import { LeadDoNotContactToggle } from "@/components/portal/LeadDoNotContactToggle";
import { LeadTimeline } from "@/components/portal/LeadTimeline";
import { getLeadTimeline, TIMELINE_PAGE } from "@/lib/lead-timeline";
import { LeadCustomFieldsPanel } from "@/components/portal/LeadCustomFieldsPanel";
import { getActiveCustomFields } from "@/lib/custom-fields-db";
import { inputValue } from "@/lib/custom-fields";
import { LeadNotesPanel } from "@/components/portal/LeadNotesPanel";
import { LeadDuplicatesPanel } from "@/components/portal/LeadDuplicatesPanel";
import { CreateOpportunityDialog } from "@/components/portal/CreateOpportunityDialog";
import { LeadSearchProfiles } from "@/components/realty/LeadSearchProfiles";
import { getLeadSearchViews, getLeadSuggestionViews } from "@/lib/realty/lead-profile";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

export default async function LeadDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "CRM");

  const { id } = await params;
  const { t: timelineParam } = await searchParams;
  const timelineLimit = Math.min(300, Math.max(TIMELINE_PAGE, Number(timelineParam) || TIMELINE_PAGE));
  const orgId = session.user.organizationId;

  const lead = await prisma.lead.findFirst({ where: { id, organizationId: orgId, deletedAt: null } });
  if (!lead) return notFound();

  const [t, lang, opportunities, notes, stages, users, duplicates, timeline, customFields, aiActions] = await Promise.all([
    getServerT(),
    getServerLang(),
    prisma.opportunity.findMany({
      where: { leadId: lead.id },
      orderBy: { updatedAt: "desc" },
      include: { pipelineStage: { select: { id: true, name: true } }, owner: { select: { name: true, email: true } } },
    }),
    prisma.note.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { id: true, name: true, email: true } } },
    }),
    prisma.pipelineStage.findMany({ where: { organizationId: orgId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true, email: true }, orderBy: { createdAt: "asc" } }),
    findPotentialDuplicateLeads(orgId, lead, lead.id),
    getLeadTimeline(lead, timelineLimit),
    getActiveCustomFields(orgId),
    getLeadAiActions(orgId, lead.id),
  ]);

  const searchViews = await getLeadSearchViews(orgId, lead.id, lang === "en" ? "en" : "es");
  const searchSuggestions = searchViews ? await getLeadSuggestionViews(orgId, lead.id, lang === "en" ? "en" : "es") : [];
  const canManageOpps = can(session.user.role as UserRole, "opportunities:manage");
  const stageOptions = stages.map((s) => ({ id: s.id, name: s.name }));
  const es = lang === "es";
  const L = es
    ? {
        back: t.leadsTitle,
        statOpen: "Oportunidades abiertas",
        statValue: "Valor en juego",
        statNotes: "Notas",
        statLast: "Última actividad",
        none: "Sin actividad",
        oppTitle: "Oportunidades",
        oppHint: "Ventas o servicios en curso con esta persona. Crea una cuando muestre interés real.",
        oppEmpty: "Aún no hay oportunidades con este contacto.",
        searchHint: "Lo que busca en una propiedad. Sirve para sugerirle opciones.",
        notesTitle: "Notas",
        notesHint: "Apuntes internos: solo tu equipo los ve.",
        timelineTitle: "Historial",
        timelineHint: "Todo lo que ha pasado con este contacto, lo más reciente primero.",
        dataTitle: "Datos del contacto",
        dataHint: "Etiquetas y preferencias para organizarlo.",
        email: "Correo",
        phone: "Teléfono",
        source: "Origen",
        created: "Alta",
        tags: "Etiquetas",
        tagsHint: "Palabras para encontrarlo y agruparlo después.",
        extra: "Datos adicionales",
      }
    : {
        back: t.leadsTitle,
        statOpen: "Open opportunities",
        statValue: "Value at stake",
        statNotes: "Notes",
        statLast: "Last activity",
        none: "No activity",
        oppTitle: "Opportunities",
        oppHint: "Sales or services in progress with this person. Create one when they show real interest.",
        oppEmpty: "No opportunities with this contact yet.",
        searchHint: "What they're looking for in a property. Used to suggest options.",
        notesTitle: "Notes",
        notesHint: "Internal notes: only your team can see them.",
        timelineTitle: "History",
        timelineHint: "Everything that has happened with this contact, newest first.",
        dataTitle: "Contact details",
        dataHint: "Tags and preferences to organize them.",
        email: "Email",
        phone: "Phone",
        source: "Source",
        created: "Created",
        tags: "Tags",
        tagsHint: "Words to find and group them later.",
        extra: "Additional details",
      };
  const openOpps = opportunities.filter((o) => !o.closedAt);
  const currencies = [...new Set(openOpps.filter((o) => o.amount != null).map((o) => o.currency))];
  const openValue = openOpps.reduce((a, o) => a + (o.amount ?? 0), 0);
  const lastActivity = timeline.events[0]?.date ?? null;
  const canOperateRealty = can(session.user.role as UserRole, "realty:operate");
  const fixedLead = { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone };

  return (
    <div className="space-y-5">
      <Link href="/portal/leads" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {L.back}
      </Link>

      <LeadHeaderCard
        lead={{ id: lead.id, name: lead.name, status: lead.status, email: lead.email, phone: lead.phone, doNotContact: lead.doNotContact, source: lead.source, since: formatDate(lead.createdAt, lang) }}
        canUpdateStatus={can(session.user.role as UserRole, "leads:update_status")}
        canDelete={can(session.user.role as UserRole, "leads:delete")}
      />

      <LeadAgentSuggestions actions={aiActions} canManage={canManageOpps} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={L.statOpen} value={String(openOpps.length)} />
        <Stat label={L.statValue} value={currencies.length === 1 ? formatCurrency(openValue, currencies[0]) : "—"} />
        <Stat label={L.statNotes} value={String(notes.length)} />
        <Stat label={L.statLast} value={lastActivity ? formatDate(lastActivity, lang) : L.none} />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Section icon={GitBranch} title={L.oppTitle} hint={L.oppHint} action={canManageOpps ? <CreateOpportunityDialog stages={stageOptions} users={users} fixedLead={fixedLead} /> : undefined}>
            {opportunities.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">{L.oppEmpty}</p>
            ) : (
              <div className="space-y-2">
                {opportunities.map((opp) => (
                  <div key={opp.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{opp.title}</p>
                      <p className="text-xs text-slate-500">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{opp.pipelineStage.name}</span>
                        {" · "}{opp.owner?.name ?? opp.owner?.email ?? "—"}
                        {opp.estimatedCloseDate && ` · ${formatDate(opp.estimatedCloseDate, lang)}`}
                      </p>
                    </div>
                    <span className="flex-shrink-0 font-semibold text-slate-900">{opp.amount != null ? formatCurrency(opp.amount, opp.currency) : "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {searchViews && (
            <Section icon={Home} title={es ? "Lo que busca" : "What they're looking for"} hint={L.searchHint}>
              <LeadSearchProfiles views={searchViews} suggestions={searchSuggestions} leadId={lead.id} canOperate={canOperateRealty} lang={lang === "en" ? "en" : "es"} hideTitle />
            </Section>
          )}

          <Section icon={StickyNote} title={L.notesTitle} hint={L.notesHint}>
            <LeadNotesPanel
              leadId={lead.id}
              initialNotes={notes.map((n) => ({
                id: n.id,
                content: n.content,
                createdAt: n.createdAt,
                authorName: n.author?.name ?? n.author?.email ?? null,
                canDelete: n.authorId === session.user.id || ["OWNER", "ADMIN", "SUPER_ADMIN", "MANAGER"].includes(session.user.role),
              }))}
            />
          </Section>

          <Section icon={ArrowRightLeft} title={L.timelineTitle} hint={L.timelineHint}>
            <LeadTimeline events={timeline.events} hasMore={timeline.hasMore} moreHref={`/portal/leads/${lead.id}?t=${timelineLimit + TIMELINE_PAGE}`} lang={lang === "en" ? "en" : "es"} />
          </Section>
        </div>

        <div className="space-y-5 lg:col-span-1">
          <Section icon={Contact} title={L.dataTitle} hint={L.dataHint}>
            <dl className="space-y-2.5">
              <Row label={L.email}>{lead.email ?? "—"}</Row>
              <Row label={L.phone}>{lead.phone ?? "—"}</Row>
              <Row label={L.source}>{lead.source ?? "manual"}</Row>
              <Row label={L.created}>{formatDate(lead.createdAt, lang)}</Row>
            </dl>
            {lead.notes && <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{lead.notes}</p>}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-sm font-medium text-slate-700">{L.tags}</p>
              <p className="mb-2 text-xs text-slate-500">{L.tagsHint}</p>
              <LeadTagsEditor leadId={lead.id} initialTags={lead.tags} />
            </div>
            <div className="mt-3 border-t border-slate-100 pt-3">
              <LeadDoNotContactToggle leadId={lead.id} initialDoNotContact={lead.doNotContact} />
            </div>
          </Section>

          {customFields.length > 0 && (
            <Section icon={Contact} title={L.extra} hint={es ? "Campos propios de tu negocio." : "Fields specific to your business."}>
              <LeadCustomFieldsPanel
                leadId={lead.id}
                canEdit={can(session.user.role as UserRole, "leads:create")}
                fields={customFields.map((f) => ({
                  key: f.key,
                  label: f.label,
                  type: f.type,
                  options: f.options,
                  value: inputValue(f, (lead.customFields as Record<string, unknown> | null)?.[f.key]),
                }))}
              />
            </Section>
          )}

          <LeadDuplicatesPanel leadId={lead.id} duplicates={duplicates.map((d) => ({ id: d.id, name: d.name, email: d.email, phone: d.phone }))} />
        </div>
      </div>
    </div>
  );
}
