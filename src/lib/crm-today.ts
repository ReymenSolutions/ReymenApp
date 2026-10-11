import { prisma } from "./prisma";
import { getDueFollowUps } from "./follow-ups";

/** Cuántos renglones se muestran por bloque; el total real va aparte. */
const LIMIT = 8;
/** Una oportunidad abierta sin movimiento por tantos días cuenta como "sin actividad". */
const STALE_DAYS = 7;
/** Un lead nuevo sin tocar por tantos minutos ya cuenta como "sin respuesta". */
const NEW_LEAD_GRACE_MINUTES = 60;

function zonedParts(timeZone: string, date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(date);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { y: n("year"), m: n("month"), d: n("day"), h: n("hour"), min: n("minute"), s: n("second") };
}

/** Inicio y fin (exclusivo) del día de `now` en la zona horaria del negocio, como instantes UTC. */
export function dayRangeIn(timeZone: string, now = new Date()): { start: Date; end: Date } {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = "America/Mexico_City";
  }
  const { y, m, d } = zonedParts(tz, now);
  const offsetAt = (instant: Date) => {
    const p = zonedParts(tz, instant);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - instant.getTime();
  };
  const localMidnight = (day: number) => {
    const guess = Date.UTC(y, m - 1, day);
    const first = guess - offsetAt(new Date(guess));
    return new Date(guess - offsetAt(new Date(first)));
  };
  return { start: localMidnight(d), end: localMidnight(d + 1) };
}

export interface TodayView {
  /** Conversaciones donde el cliente escribió y nadie ha contestado, y que requieren a una persona. */
  waiting: { total: number; items: { id: string; leadId: string | null; name: string; preview: string; since: Date }[] };
  /** Seguimientos automáticos que ya tocan según las reglas del cliente. */
  followUps: { total: number; items: { leadId: string; name: string; attempt: number }[] };
  /** Citas de hoy (hora del negocio) pendientes o confirmadas. */
  appointments: { total: number; items: { id: string; title: string; leadName: string | null; startTime: Date; status: string }[] };
  /** Oportunidades abiertas con la próxima actividad vencida o sin movimiento hace días. */
  staleOpportunities: { total: number; items: { id: string; leadId: string; title: string; leadName: string; amount: number | null; since: Date; overdue: boolean }[] };
  /** Leads nuevos que nadie ha trabajado. */
  newLeads: { total: number; items: { id: string; name: string; source: string | null; createdAt: Date }[] };
}

export async function getTodayView(orgId: string, timeZone: string, now = new Date()): Promise<TodayView> {
  const { start, end } = dayRangeIn(timeZone, now);
  const staleCutoff = new Date(now.getTime() - STALE_DAYS * 24 * 3600_000);
  const newLeadCutoff = new Date(now.getTime() - NEW_LEAD_GRACE_MINUTES * 60_000);

  const openOpp = { organizationId: orgId, closedAt: null, pipelineStage: { isWon: false, isLost: false } };
  const staleWhere = {
    ...openOpp,
    OR: [{ nextActivityAt: { lt: now } }, { nextActivityAt: null, updatedAt: { lt: staleCutoff } }],
  };
  const newLeadWhere = { organizationId: orgId, status: "NEW" as const, doNotContact: false, deletedAt: null, createdAt: { lt: newLeadCutoff } };
  const apptWhere = { organizationId: orgId, startTime: { gte: start, lt: end }, status: { in: ["SCHEDULED", "CONFIRMED"] as ("SCHEDULED" | "CONFIRMED")[] } };

  // Conversaciones abiertas que necesitan a una persona (escaladas, o con la IA
  // apagada); solo cuentan si lo último que se dijo vino del cliente.
  const needsHuman = await prisma.conversation.findMany({
    where: { organizationId: orgId, status: { in: ["OPEN", "ESCALATED"] }, OR: [{ status: "ESCALATED" }, { aiHandled: false }] },
    include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, lead: { select: { name: true } } },
    orderBy: { updatedAt: "asc" },
    take: 200,
  });
  const waitingAll = needsHuman.filter((c) => c.messages[0]?.role === "USER");

  const [followUps, apptTotal, appts, staleTotal, stale, newTotal, newLeads] = await Promise.all([
    getDueFollowUps(orgId, now),
    prisma.appointment.count({ where: apptWhere }),
    prisma.appointment.findMany({ where: apptWhere, orderBy: { startTime: "asc" }, take: LIMIT, include: { lead: { select: { name: true } } } }),
    prisma.opportunity.count({ where: staleWhere }),
    prisma.opportunity.findMany({
      where: staleWhere,
      orderBy: [{ nextActivityAt: { sort: "asc", nulls: "last" } }, { updatedAt: "asc" }],
      take: LIMIT,
      include: { lead: { select: { name: true } } },
    }),
    prisma.lead.count({ where: newLeadWhere }),
    prisma.lead.findMany({ where: newLeadWhere, orderBy: { createdAt: "asc" }, take: LIMIT, select: { id: true, name: true, source: true, createdAt: true } }),
  ]);

  return {
    waiting: {
      total: waitingAll.length,
      items: waitingAll.slice(0, LIMIT).map((c) => ({
        id: c.id,
        leadId: c.leadId,
        name: c.lead?.name ?? c.contactName ?? c.contactPhone ?? "—",
        preview: c.messages[0].content.slice(0, 120),
        since: c.messages[0].createdAt,
      })),
    },
    followUps: {
      total: followUps.length,
      items: followUps.slice(0, LIMIT).map((f) => ({ leadId: f.leadId, name: f.contactName, attempt: f.attemptNumber })),
    },
    appointments: {
      total: apptTotal,
      items: appts.map((a) => ({ id: a.id, title: a.title, leadName: a.lead?.name ?? null, startTime: a.startTime, status: a.status })),
    },
    staleOpportunities: {
      total: staleTotal,
      items: stale.map((o) => ({
        id: o.id,
        leadId: o.leadId,
        title: o.title,
        leadName: o.lead.name,
        amount: o.amount,
        since: o.nextActivityAt ?? o.updatedAt,
        overdue: Boolean(o.nextActivityAt && o.nextActivityAt < now),
      })),
    },
    newLeads: { total: newTotal, items: newLeads },
  };
}
