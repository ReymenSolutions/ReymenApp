import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { emitDomainEvent } from "@/lib/domain-events";
import { getBlueprint } from "./blueprints";
import { localHour } from "./policy";
import { addDays, buildDailyReport, localDateString } from "./report";
import { atRiskDays } from "./customer-signals";
import { birthdayWhere } from "@/lib/birthday";

/**
 * Detectores del reloj: lo que no lo dispara un hecho sino la hora. Hoy, el reporte diario: cuando en la zona del
 * negocio ya pasó la hora configurada, se arma el reporte del día anterior y se deja UN evento por día (la llave
 * única impide repetirlo aunque el tick corra cada 5 minutos).
 */
export async function runClockDetectors(now: Date = new Date(), opts: { organizationId?: string } = {}): Promise<{ reports: number; secondVisits: number; atRisk: number; birthdays: number; vips: number }> {
  let reports = 0;
  const automations = await prisma.automation.findMany({
    where: { status: "ACTIVE", trigger: "report.daily_due", blueprintKey: { not: null }, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}) },
    include: { organization: { select: { id: true, timezone: true } } },
  });
  for (const automation of automations) {
    const blueprint = getBlueprint(automation.blueprintKey!, automation.blueprintVersion);
    if (!blueprint) continue;
    const config = blueprint.configSchema.safeParse(automation.config ?? {});
    if (!config.success) continue;
    const { id: organizationId, timezone } = automation.organization;
    if (localHour(now, timezone) < ((config.data as { sendHour?: number }).sendHour ?? 8)) continue;

    const reportDate = addDays(localDateString(now, timezone), -1);
    const dedupeKey = `report.daily_due:${reportDate}`;
    if (await prisma.domainEvent.findUnique({ where: { organizationId_dedupeKey: { organizationId, dedupeKey } }, select: { id: true } })) continue;
    let modulesOk = true;
    for (const required of blueprint.requiredModules) if (!(await hasModule(organizationId, required))) modulesOk = false;
    if (!modulesOk) continue;

    const report = await buildDailyReport(organizationId, reportDate, timezone);
    await prisma.$transaction((tx) =>
      emitDomainEvent(tx, { organizationId, type: "report.daily_due", subjectType: "report", subjectId: reportDate, occurredAt: now, payload: report as unknown as object, dedupeKey }),
    );
    reports++;
  }
  const customers = await runCustomerDetectors(now, opts);
  return { reports, ...customers };
}

const DAY = 86_400_000;
const CANDIDATES_PER_RUN = 200;
/** Un cliente se considera "recién VIP" si su última visita es de estos días o menos. */
const VIP_RECENT_DAYS = 3;

/** Solo emite los eventos cuya llave aún no existe (el tick corre cada 5 min: no se reescribe lo ya detectado). */
async function emitMissing(organizationId: string, now: Date, events: { type: string; subjectId: string; dedupeKey: string; payload: object }[]): Promise<number> {
  if (events.length === 0) return 0;
  const existing = new Set((await prisma.domainEvent.findMany({ where: { organizationId, dedupeKey: { in: events.map((e) => e.dedupeKey) } }, select: { dedupeKey: true } })).map((e) => e.dedupeKey));
  const fresh = events.filter((e) => !existing.has(e.dedupeKey));
  if (fresh.length === 0) return 0;
  await prisma.$transaction(async (tx) => {
    for (const e of fresh) await emitDomainEvent(tx, { organizationId, type: e.type, subjectType: "customer", subjectId: e.subjectId, occurredAt: now, payload: e.payload, dedupeKey: e.dedupeKey });
  });
  return fresh.length;
}

/** Clientes que vinieron una sola vez (segunda visita) y habituales que se alejan (recuperación). */
async function runCustomerDetectors(now: Date, opts: { organizationId?: string }): Promise<{ secondVisits: number; atRisk: number; birthdays: number; vips: number }> {
  let secondVisits = 0;
  let atRisk = 0;
  let birthdays = 0;
  let vips = 0;
  const automations = await prisma.automation.findMany({
    where: { status: "ACTIVE", trigger: { in: ["customer.second_visit_due", "customer.at_risk", "customer.birthday", "customer.vip"] }, blueprintKey: { not: null }, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}) },
    include: { organization: { select: { timezone: true } } },
  });
  for (const automation of automations) {
    const blueprint = getBlueprint(automation.blueprintKey!, automation.blueprintVersion);
    if (!blueprint) continue;
    const parsed = blueprint.configSchema.safeParse(automation.config ?? {});
    if (!parsed.success) continue;
    const config = parsed.data as Record<string, number>;
    const timezone = automation.organization.timezone;
    const organizationId = automation.organizationId;
    let modulesOk = true;
    for (const required of blueprint.requiredModules) if (!(await hasModule(organizationId, required))) modulesOk = false;
    if (!modulesOk) continue;

    if (automation.trigger === "customer.second_visit_due") {
      const candidates = await prisma.customer.findMany({
        where: { organizationId, visitCount: 1, consentAccepted: true, firstVisitAt: { lte: new Date(now.getTime() - config.afterDays * DAY), gte: new Date(now.getTime() - config.maxDays * DAY) } },
        orderBy: { firstVisitAt: "desc" },
        take: CANDIDATES_PER_RUN,
        select: { id: true, firstVisitAt: true },
      });
      secondVisits += await emitMissing(organizationId, now, candidates.map((c) => ({ type: "customer.second_visit_due", subjectId: c.id, dedupeKey: `customer.second_visit_due:${c.id}`, payload: { customerId: c.id, firstVisitAt: c.firstVisitAt?.toISOString() ?? null } })));
    } else if (automation.trigger === "customer.birthday") {
      // Cumpleaños de HOY en la zona del negocio, a partir de la hora configurada; un evento por cliente y año.
      if (localHour(now, timezone) < config.sendHour) continue;
      const today = localDateString(now, timezone);
      const candidates = await prisma.customer.findMany({
        where: { organizationId, consentAccepted: true, ...birthdayWhere(today) },
        take: CANDIDATES_PER_RUN,
        select: { id: true },
      });
      birthdays += await emitMissing(organizationId, now, candidates.map((c) => ({ type: "customer.birthday", subjectId: c.id, dedupeKey: `customer.birthday:${c.id}:${today.slice(0, 4)}`, payload: { customerId: c.id, date: today } })));
    } else if (automation.trigger === "customer.vip") {
      // VIP "recién alcanzado": cumple el umbral y su última visita es de los últimos días (esa visita fue la que lo hizo VIP).
      // Así, al encender el aviso no llega una avalancha con todos los VIP históricos. Un evento por cliente.
      const candidates = await prisma.customer.findMany({
        where: { organizationId, visitCount: { gte: config.minVisits }, totalSpent: { gte: config.minSpent }, lastVisitAt: { gte: new Date(now.getTime() - VIP_RECENT_DAYS * DAY) } },
        orderBy: { lastVisitAt: "desc" },
        take: CANDIDATES_PER_RUN,
        select: { id: true, visitCount: true, totalSpent: true },
      });
      vips += await emitMissing(organizationId, now, candidates.map((c) => ({ type: "customer.vip", subjectId: c.id, dedupeKey: `customer.vip:${c.id}`, payload: { customerId: c.id, visitCount: c.visitCount, totalSpent: Number(c.totalSpent) } })));
    } else {
      const candidates = await prisma.customer.findMany({
        where: { organizationId, visitCount: { gte: config.minVisits }, consentAccepted: true, lastVisitAt: { lte: new Date(now.getTime() - config.minDays * DAY), gte: new Date(now.getTime() - config.maxDays * DAY) } },
        orderBy: { lastVisitAt: "desc" },
        take: CANDIDATES_PER_RUN,
        select: { id: true, visitCount: true, lastVisitAt: true },
      });
      if (candidates.length === 0) continue;
      const sales = await prisma.foodSale.findMany({ where: { organizationId, customerId: { in: candidates.map((c) => c.id) }, grossAmount: { gt: 0 } }, select: { customerId: true, occurredAt: true } });
      const byCustomer = new Map<string, Date[]>();
      for (const s of sales) byCustomer.set(s.customerId!, [...(byCustomer.get(s.customerId!) ?? []), s.occurredAt]);
      const events = [];
      for (const c of candidates) {
        const daysSince = atRiskDays({ visitCount: c.visitCount, lastVisitAt: c.lastVisitAt, visits: byCustomer.get(c.id) ?? [], now, minVisits: config.minVisits, minDays: config.minDays, factor: config.factor, maxDays: config.maxDays });
        if (daysSince === null) continue;
        // Un episodio por ausencia: la llave lleva la fecha de su última visita (si regresa y se vuelve a alejar, es otro).
        events.push({ type: "customer.at_risk", subjectId: c.id, dedupeKey: `customer.at_risk:${c.id}:${c.lastVisitAt!.getTime()}`, payload: { customerId: c.id, lastVisitAt: c.lastVisitAt!.toISOString(), daysSince } });
      }
      atRisk += await emitMissing(organizationId, now, events);
    }
  }
  return { secondVisits, atRisk, birthdays, vips };
}
