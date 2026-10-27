"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertModuleEnabled } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { getLeadTimeline, type LeadTimelineEvent } from "@/lib/lead-timeline";
import { UserError } from "@/lib/user-error";
import { getServerLang } from "@/lib/i18n-server";
import { getLeadSearchViews, getLeadSuggestionViews, type LeadSearchView, type LeadSuggestionView } from "@/lib/realty/lead-profile";
import type { LeadStatus, UserRole } from "@prisma/client";

export type LeadPanelData = {
  lead: { id: string; name: string; email: string | null; phone: string | null; status: LeadStatus; source: string | null; tags: string[]; doNotContact: boolean; createdAt: Date; notes: string | null };
  opportunities: { id: string; title: string; amount: number | null; currency: string; stageId: string; stageName: string; ownerName: string | null; estimatedCloseDate: Date | null }[];
  stages: { id: string; name: string }[];
  timeline: { events: LeadTimelineEvent[]; hasMore: boolean };
  /** Lo que el Agente IA hizo solo (con deshacer) o sugiere en este contacto: lo que sigue pendiente de revisar. */
  aiActions: { id: string; status: "APPLIED" | "SUGGESTED"; kind: "CREATE_OPPORTUNITY" | "ADVANCE_STAGE" | "CLOSE_WON" | "CLOSE_LOST"; reason: string; opportunityTitle: string; fromStageName: string | null; toStageName: string | null; createdAt: Date }[];
  /** «Lo que busca» (Real Estate); null si la organización no tiene ese módulo. */
  realty: { views: LeadSearchView[]; suggestions: LeadSuggestionView[]; canOperate: boolean } | null;
  canManageOpps: boolean;
  canUpdateStatus: boolean;
  /** Nombre de quien tiene la sesión (autor de las notas que agrega desde el panel). */
  me: string;
};

/**
 * Datos del panel lateral de un contacto: lo mismo que la ficha completa (contacto, oportunidades, historial)
 * en una sola respuesta. Siempre acotado a la organización de la sesión: un id de otro negocio es "no encontrado".
 */
export async function getLeadPanel(leadId: string): Promise<LeadPanelData> {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  const orgId = session.user.organizationId;
  await assertModuleEnabled(orgId, "CRM");

  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: orgId, deletedAt: null } });
  if (!lead) throw new UserError("Lead no encontrado");

  const [opportunities, stages, timeline, aiActions] = await Promise.all([
    prisma.opportunity.findMany({
      where: { leadId: lead.id, organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      include: { pipelineStage: { select: { id: true, name: true } }, owner: { select: { name: true, email: true } } },
    }),
    prisma.pipelineStage.findMany({ where: { organizationId: orgId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    getLeadTimeline(lead, 15),
    prisma.pipelineAiAction.findMany({
      where: { leadId: lead.id, organizationId: orgId, OR: [{ status: "SUGGESTED" }, { status: "APPLIED", createdAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } }] },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, status: true, kind: true, reason: true, opportunityTitle: true, fromStageName: true, toStageName: true, createdAt: true },
    }),
  ]);

  const serverLang = await getServerLang();
  const realtyViews = await getLeadSearchViews(orgId, lead.id, serverLang);
  const realtySuggestions = realtyViews ? await getLeadSuggestionViews(orgId, lead.id, serverLang) : [];

  return {
    lead: { id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, status: lead.status, source: lead.source, tags: lead.tags, doNotContact: lead.doNotContact, createdAt: lead.createdAt, notes: lead.notes },
    opportunities: opportunities.map((o) => ({
      id: o.id,
      title: o.title,
      amount: o.amount,
      currency: o.currency,
      stageId: o.pipelineStage.id,
      stageName: o.pipelineStage.name,
      ownerName: o.owner?.name ?? o.owner?.email ?? null,
      estimatedCloseDate: o.estimatedCloseDate,
    })),
    stages,
    timeline,
    aiActions: aiActions.map((a) => ({ ...a, status: a.status as "APPLIED" | "SUGGESTED" })),
    realty: realtyViews ? { views: realtyViews, suggestions: realtySuggestions, canOperate: can(session.user.role as UserRole, "realty:operate") } : null,
    canManageOpps: can(session.user.role as UserRole, "opportunities:manage"),
    canUpdateStatus: can(session.user.role as UserRole, "leads:update_status"),
    me: session.user.name ?? session.user.email ?? "",
  };
}
