import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, GitBranch, StickyNote, ArrowRightLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { findPotentialDuplicateLeads } from "@/lib/duplicate-detection";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LeadActions } from "@/components/portal/LeadActions";
import { LeadTagsEditor } from "@/components/portal/LeadTagsEditor";
import { LeadDoNotContactToggle } from "@/components/portal/LeadDoNotContactToggle";
import { LeadTimeline } from "@/components/portal/LeadTimeline";
import { getLeadTimeline, TIMELINE_PAGE } from "@/lib/lead-timeline";
import { LeadNotesPanel } from "@/components/portal/LeadNotesPanel";
import { LeadDuplicatesPanel } from "@/components/portal/LeadDuplicatesPanel";
import { CreateOpportunityDialog } from "@/components/portal/CreateOpportunityDialog";
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

  const [t, lang, opportunities, notes, stages, users, duplicates, timeline] = await Promise.all([
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
  ]);

  const canManageOpps = can(session.user.role as UserRole, "opportunities:manage");
  const stageOptions = stages.map((s) => ({ id: s.id, name: s.name }));
  const fixedLead = { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone };

  return (
    <div>
      <Link href="/portal/leads" className="mb-3 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-3.5 w-3.5" />
        {t.leadsTitle}
      </Link>

      <PageHeader
        title={lead.name}
        description={t.leadDetailTitle}
        actions={<LeadActions leadId={lead.id} currentStatus={lead.status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: contact info + tags + duplicates */}
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader><CardTitle>{lang === "es" ? "Contacto" : "Contact"}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t.colStatus}</span>
                <StatusBadge status={lead.status} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Email</span>
                <span className="font-medium text-slate-900">{lead.email ?? "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{lang === "es" ? "Teléfono" : "Phone"}</span>
                <span className="font-medium text-slate-900">{lead.phone ?? "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t.colSource}</span>
                <Badge variant="secondary">{lead.source ?? "manual"}</Badge>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">{t.colDate}</span>
                <span className="font-medium text-slate-900">{formatDate(lead.createdAt)}</span>
              </div>
              {lead.notes && (
                <div className="border-t border-slate-100 pt-3 text-sm text-slate-600">{lead.notes}</div>
              )}
              <div className="border-t border-slate-100 pt-3">
                <p className="mb-1.5 text-xs font-medium text-slate-500">{lang === "es" ? "Etiquetas" : "Tags"}</p>
                <LeadTagsEditor leadId={lead.id} initialTags={lead.tags} />
              </div>
              <div className="border-t border-slate-100 pt-3">
                <LeadDoNotContactToggle leadId={lead.id} initialDoNotContact={lead.doNotContact} />
              </div>
            </CardContent>
          </Card>

          <LeadDuplicatesPanel leadId={lead.id} duplicates={duplicates.map((d) => ({ id: d.id, name: d.name, email: d.email, phone: d.phone }))} />

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-1.5"><StickyNote className="h-4 w-4" />{lang === "es" ? "Notas" : "Notes"}</CardTitle></CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </div>

        {/* Right column: opportunities + timeline */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-1.5"><GitBranch className="h-4 w-4" />{lang === "es" ? "Oportunidades" : "Opportunities"}</CardTitle>
              {canManageOpps && <CreateOpportunityDialog stages={stageOptions} users={users} fixedLead={fixedLead} />}
            </CardHeader>
            <CardContent>
              {opportunities.length === 0 ? (
                <p className="text-xs text-slate-400">{lang === "es" ? "Sin oportunidades" : "No opportunities"}</p>
              ) : (
                <div className="space-y-2">
                  {opportunities.map((opp) => (
                    <div key={opp.id} className="flex items-center justify-between rounded-md border border-slate-100 p-2.5 text-sm">
                      <div>
                        <p className="font-medium text-slate-900">{opp.title}</p>
                        <p className="text-xs text-slate-400">
                          {opp.pipelineStage.name} · {opp.owner?.name ?? opp.owner?.email ?? "—"}
                          {opp.estimatedCloseDate && ` · ${formatDate(opp.estimatedCloseDate)}`}
                        </p>
                      </div>
                      <span className="font-semibold text-slate-900">
                        {opp.amount != null ? formatCurrency(opp.amount, opp.currency) : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-1.5"><ArrowRightLeft className="h-4 w-4" />{lang === "es" ? "Historial unificado" : "Unified timeline"}</CardTitle></CardHeader>
            <CardContent>
              <LeadTimeline events={timeline.events} hasMore={timeline.hasMore} moreHref={`/portal/leads/${lead.id}?t=${timelineLimit + TIMELINE_PAGE}`} lang={lang === "en" ? "en" : "es"} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
