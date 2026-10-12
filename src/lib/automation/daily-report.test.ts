// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { addDays, buildDailyReport, localDateString, pctChange, zonedDayStart } from "./report";
import { runClockDetectors } from "./detectors";
import { runAutomationTick } from "@/lib/automation-tick";
import { getBlueprint } from "./blueprints";

const sendEmail = vi.fn();
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

describe("fechas por zona horaria (puro)", () => {
  it("medianoche local en México (UTC-6, sin horario de verano) y en Nueva York (cambia en verano)", () => {
    expect(zonedDayStart("2030-10-06", "America/Mexico_City").toISOString()).toBe("2030-10-06T06:00:00.000Z");
    expect(zonedDayStart("2030-07-01", "America/New_York").toISOString()).toBe("2030-07-01T04:00:00.000Z");
    expect(zonedDayStart("2030-01-15", "America/New_York").toISOString()).toBe("2030-01-15T05:00:00.000Z");
  });
  it("fecha local y suma de días (cruzando fin de mes)", () => {
    expect(localDateString(new Date("2030-10-07T03:00:00Z"), "America/Mexico_City")).toBe("2030-10-06");
    expect(addDays("2030-10-31", 1)).toBe("2030-11-01");
    expect(addDays("2030-03-01", -1)).toBe("2030-02-28");
  });
  it("variación porcentual: sin base no hay porcentaje", () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(50, 0)).toBeNull();
  });
});

describe("reporte ejecutivo diario", () => {
  let org: { id: string };
  let variantId: string;
  let itemId: string;
  // Reporte del 6 de octubre de 2030 (CDMX): se manda el 7 a partir de las 8:00 locales.
  const DAY = "2030-10-06";
  const at = (hourUtc: number, day = DAY) => new Date(`${day}T${String(hourUtc).padStart(2, "0")}:00:00Z`);
  const SEND_TIME = new Date("2030-10-07T15:00:00Z"); // 09:00 CDMX del día 7

  beforeAll(async () => {
    org = await createTestOrg("Daily Report Org");
    await prisma.organization.update({ where: { id: org.id }, data: { name: "La Taquería" } });
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    const dish = await prisma.foodDish.create({ data: { organizationId: org.id, name: "Taco", variants: { create: [{ organizationId: org.id, label: "Único", price: 50 }] } }, include: { variants: true } });
    variantId = dish.variants[0].id;
    await prisma.user.create({ data: { organizationId: org.id, email: `owner-${org.id}@t.mx`, name: "Dueña", role: "OWNER", passwordHash: "x" } });
    await prisma.user.create({ data: { organizationId: org.id, email: `agent-${org.id}@t.mx`, name: "Agente", role: "AGENT", passwordHash: "x" } });
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });
  beforeEach(async () => {
    sendEmail.mockReset();
    sendEmail.mockResolvedValue({ sent: true });
    await prisma.automationExecution.deleteMany({ where: { organizationId: org.id } });
    await prisma.automation.deleteMany({ where: { organizationId: org.id } });
    await prisma.domainEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.foodSale.deleteMany({ where: { organizationId: org.id } });
    await prisma.foodDishSale.deleteMany({ where: { organizationId: org.id } });
    await prisma.foodInventoryMovement.deleteMany({ where: { organizationId: org.id } });
    await prisma.foodInventoryItem.deleteMany({ where: { organizationId: org.id } });
    const item = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Tomate", unit: "kg", currentStock: 1, minStock: 8 } });
    itemId = item.id;
    // Ventas: el día del reporte, el día anterior y el mismo día de la semana pasada.
    const sale = (day: string, hourUtc: number, gross: number) => prisma.foodSale.create({ data: { organizationId: org.id, occurredAt: at(hourUtc, day), grossAmount: gross, netAmount: gross * 0.86, source: "POS" } });
    await sale(DAY, 18, 300);
    await sale(DAY, 20, 100);
    await sale(DAY, 22, -100); // cancelación
    await sale("2030-10-05", 18, 200);
    await sale("2030-09-29", 18, 400);
    await sale("2030-10-07", 14, 999); // ya es otro día (hoy): no cuenta
    await prisma.foodDishSale.create({ data: { organizationId: org.id, variantId, occurredAt: zonedDayStart(DAY, "America/Mexico_City"), quantity: 12 } });
    await prisma.foodInventoryMovement.create({ data: { organizationId: org.id, inventoryItemId: itemId, type: "WASTE", quantity: -2, stockAfter: 1, createdAt: at(19) } });
  });

  const enable = (over: { dryRun?: boolean; config?: object } = {}) => {
    const bp = getBlueprint("daily_executive_report")!;
    return prisma.automation.create({ data: { organizationId: org.id, name: bp.name, type: "blueprint", webhookSecret: "s", blueprintKey: bp.key, blueprintVersion: bp.version, trigger: bp.trigger, config: { ...bp.defaultConfig, ...(over.config ?? {}) } as object, dryRun: over.dryRun ?? false } });
  };

  it("arma el reporte con ventas, comparativos, top productos, cancelaciones, stock crítico y merma", async () => {
    const r = await buildDailyReport(org.id, DAY, "America/Mexico_City");
    expect(r.today).toMatchObject({ gross: 400, tickets: 2, avgTicket: 200, cancellations: 1, cancelledAmount: 100 });
    expect(r.previousDay.gross).toBe(200);
    expect(r.sameWeekdayLastWeek.gross).toBe(400);
    expect(r.vsPreviousDayPct).toBe(100);
    expect(r.vsLastWeekPct).toBe(0);
    expect(r.topProducts).toEqual([{ name: "Taco", quantity: 12 }]);
    expect(r.criticalStock).toEqual([{ name: "Tomate", unit: "kg", currentStock: 1, minStock: 8 }]);
    expect(r.lowStockCount).toBe(1);
    expect(r.waste).toEqual([{ name: "Tomate", unit: "kg", quantity: 2 }]);
  });

  it("antes de la hora configurada no hay reporte; después, uno solo por día aunque el reloj corra muchas veces", async () => {
    await enable();
    expect((await runClockDetectors(new Date("2030-10-07T13:00:00Z"))).reports).toBe(0); // 07:00 CDMX
    expect((await runClockDetectors(SEND_TIME, { organizationId: org.id })).reports).toBe(1);
    expect((await runClockDetectors(new Date(SEND_TIME.getTime() + 300_000), { organizationId: org.id })).reports).toBe(0);
    const events = await prisma.domainEvent.findMany({ where: { organizationId: org.id, type: "report.daily_due" } });
    expect(events).toHaveLength(1);
    expect(events[0].subjectId).toBe(DAY);
    // Al día siguiente toca el reporte del día 7.
    expect((await runClockDetectors(new Date("2030-10-08T15:00:00Z"), { organizationId: org.id })).reports).toBe(1);
  });

  it("con la automatización activa lo manda por correo SOLO a dueños y gerentes y queda en la actividad", async () => {
    const auto = await enable();
    await runAutomationTick(SEND_TIME, { organizationId: org.id });
    const [ex] = await prisma.automationExecution.findMany({ where: { automationId: auto.id } });
    expect(ex).toMatchObject({ status: "SUCCEEDED", subjectType: "report" });
    expect(ex.action).toMatchObject({ type: "report", title: `Reporte del ${DAY}` });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = sendEmail.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(mail.to).toBe(`owner-${org.id}@t.mx`);
    expect(mail.subject).toContain("La Taquería");
    expect(mail.html).toContain("Taco — 12");
    expect(mail.html).toContain("Tomate");
    // Otro tick el mismo día no vuelve a mandar nada.
    await runAutomationTick(new Date(SEND_TIME.getTime() + 600_000), { organizationId: org.id });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("en dry-run se registra pero no se manda ningún correo", async () => {
    const auto = await enable({ dryRun: true });
    await runAutomationTick(SEND_TIME, { organizationId: org.id });
    expect((await prisma.automationExecution.findFirstOrThrow({ where: { automationId: auto.id } })).status).toBe("DRY_RUN");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("si el correo falla, el reporte igual queda registrado", async () => {
    sendEmail.mockRejectedValue(new Error("smtp caído"));
    const auto = await enable();
    await runAutomationTick(SEND_TIME, { organizationId: org.id });
    expect((await prisma.automationExecution.findFirstOrThrow({ where: { automationId: auto.id } })).status).toBe("SUCCEEDED");
  });

  it("sin la automatización habilitada, o pausada, no se arma nada", async () => {
    expect((await runClockDetectors(SEND_TIME, { organizationId: org.id })).reports).toBe(0);
    const auto = await enable();
    await prisma.automation.update({ where: { id: auto.id }, data: { status: "PAUSED" } });
    expect((await runClockDetectors(SEND_TIME, { organizationId: org.id })).reports).toBe(0);
  });

  it("respeta la hora configurada (sendHour)", async () => {
    await enable({ config: { sendHour: 12 } });
    expect((await runClockDetectors(SEND_TIME, { organizationId: org.id })).reports).toBe(0); // 09:00 < 12
    expect((await runClockDetectors(new Date("2030-10-07T19:00:00Z"), { organizationId: org.id })).reports).toBe(1); // 13:00
  });
});
