import { prisma } from "./prisma";

export const TIMELINE_PAGE = 30;

export type LeadTimelineEvent =
  | { type: "created"; date: Date; source: string | null }
  | { type: "status_change"; date: Date; from: string | null; to: string; actorName: string | null }
  | { type: "note"; date: Date; content: string; authorName: string | null }
  | { type: "message"; date: Date; content: string; role: string }
  | { type: "escalated"; date: Date }
  | { type: "appointment"; date: Date; title: string; status: string }
  | { type: "follow_up"; date: Date; ruleName: string | null }
  | { type: "opportunity_created"; date: Date; title: string }
  | { type: "stage_change"; date: Date; opportunityTitle: string; toStageName: string }
  | { type: "opportunity_lost"; date: Date; opportunityTitle: string; reason: string | null };

type TimelineLead = { id: string; organizationId: string; createdAt: Date; source: string | null; phoneKey: string | null };

/** Conversaciones del contacto: enlazadas a él, o aún sin enlazar pero con su mismo teléfono. */
export function conversationsOfLead(lead: Pick<TimelineLead, "id" | "organizationId" | "phoneKey">) {
  return {
    organizationId: lead.organizationId,
    OR: [{ leadId: lead.id }, ...(lead.phoneKey ? [{ leadId: null, phoneKey: lead.phoneKey }] : [])],
  };
}

/**
 * Todo lo que ha pasado con un contacto, de lo más reciente a lo más antiguo:
 * su llegada, cambios de estado, notas, mensajes, escalaciones, citas,
 * seguimientos enviados y movimientos de sus oportunidades. Cada fuente se
 * limita a `limit` filas antes de mezclar, así que pedir una página no carga
 * todo el historial. `hasMore` indica si quedan eventos más antiguos.
 */
export async function getLeadTimeline(lead: TimelineLead, limit = TIMELINE_PAGE): Promise<{ events: LeadTimelineEvent[]; hasMore: boolean }> {
  const orgId = lead.organizationId;
  const take = limit + 1;

  const opportunities = await prisma.opportunity.findMany({ where: { leadId: lead.id, organizationId: orgId }, select: { id: true, title: true } });
  const oppTitle = new Map(opportunities.map((o) => [o.id, o.title]));
  const oppIds = opportunities.map((o) => o.id);
  const convWhere = conversationsOfLead(lead);

  const [notes, messages, escalations, appointments, followUps, leadAudits, oppAudits] = await Promise.all([
    prisma.note.findMany({ where: { leadId: lead.id, organizationId: orgId }, orderBy: { createdAt: "desc" }, take, include: { author: { select: { name: true, email: true } } } }),
    prisma.message.findMany({ where: { conversation: convWhere }, orderBy: { createdAt: "desc" }, take }),
    prisma.conversation.findMany({ where: { ...convWhere, escalatedAt: { not: null } }, orderBy: { escalatedAt: "desc" }, take, select: { escalatedAt: true } }),
    prisma.appointment.findMany({ where: { leadId: lead.id, organizationId: orgId }, orderBy: { startTime: "desc" }, take }),
    prisma.followUpLog.findMany({ where: { leadId: lead.id }, orderBy: { sentAt: "desc" }, take }),
    prisma.auditLog.findMany({ where: { organizationId: orgId, resource: "Lead", resourceId: lead.id, action: "lead.status_change" }, orderBy: { createdAt: "desc" }, take }),
    oppIds.length
      ? prisma.auditLog.findMany({
          where: { organizationId: orgId, resource: "Opportunity", resourceId: { in: oppIds }, action: { in: ["opportunity.create", "opportunity.stage_change", "opportunity.lost"] } },
          orderBy: { createdAt: "desc" },
          take,
        })
      : Promise.resolve([]),
  ]);

  const ruleIds = [...new Set(followUps.map((f) => f.ruleId))];
  const rules = ruleIds.length ? await prisma.followUpRule.findMany({ where: { id: { in: ruleIds }, organizationId: orgId }, select: { id: true, name: true } }) : [];
  const ruleName = new Map(rules.map((r) => [r.id, r.name]));
  const actorIds = [...new Set(leadAudits.map((a) => a.userId).filter((u): u is string => Boolean(u)))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
  const actorName = new Map(actors.map((u) => [u.id, u.name ?? u.email]));

  const all: LeadTimelineEvent[] = [
    { type: "created" as const, date: lead.createdAt, source: lead.source },
    ...notes.map((n): LeadTimelineEvent => ({ type: "note", date: n.createdAt, content: n.content, authorName: n.author?.name ?? n.author?.email ?? null })),
    ...messages.map((m): LeadTimelineEvent => ({ type: "message", date: m.createdAt, content: m.content, role: m.role })),
    ...escalations.map((c): LeadTimelineEvent => ({ type: "escalated", date: c.escalatedAt as Date })),
    ...appointments.map((a): LeadTimelineEvent => ({ type: "appointment", date: a.startTime, title: a.title, status: a.status })),
    ...followUps.map((f): LeadTimelineEvent => ({ type: "follow_up", date: f.sentAt, ruleName: ruleName.get(f.ruleId) ?? null })),
    ...leadAudits.map((a): LeadTimelineEvent => {
      const meta = (a.metadata ?? {}) as { from?: string; to?: string };
      return { type: "status_change", date: a.createdAt, from: meta.from ?? null, to: meta.to ?? "—", actorName: a.userId ? actorName.get(a.userId) ?? null : null };
    }),
    ...oppAudits.map((a): LeadTimelineEvent => {
      const title = oppTitle.get(a.resourceId ?? "") ?? "";
      const meta = (a.metadata ?? {}) as { toStageName?: string; lossReason?: string };
      if (a.action === "opportunity.create") return { type: "opportunity_created", date: a.createdAt, title };
      if (a.action === "opportunity.lost") return { type: "opportunity_lost", date: a.createdAt, opportunityTitle: title, reason: meta.lossReason ?? null };
      return { type: "stage_change", date: a.createdAt, opportunityTitle: title, toStageName: meta.toStageName ?? "—" };
    }),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return { events: all.slice(0, limit), hasMore: all.length > limit };
}
