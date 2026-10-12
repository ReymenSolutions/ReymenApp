import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { emitDomainEvent } from "@/lib/domain-events";
import { getBlueprint } from "./blueprints";
import { localHour } from "./policy";
import { addDays, buildDailyReport, localDateString } from "./report";

/**
 * Detectores del reloj: lo que no lo dispara un hecho sino la hora. Hoy, el reporte diario: cuando en la zona del
 * negocio ya pasó la hora configurada, se arma el reporte del día anterior y se deja UN evento por día (la llave
 * única impide repetirlo aunque el tick corra cada 5 minutos).
 */
export async function runClockDetectors(now: Date = new Date(), opts: { organizationId?: string } = {}): Promise<{ reports: number }> {
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
  return { reports };
}
