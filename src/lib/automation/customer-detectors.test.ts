// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { atRiskDays, medianIntervalDays } from "./customer-signals";
import { runClockDetectors } from "./detectors";
import { runAutomationTick } from "@/lib/automation-tick";
import { getBlueprint } from "./blueprints";

const DAY = 86_400_000;
const NOW = new Date("2030-10-07T21:00:00Z"); // 15:00 en CDMX (fuera de horas de silencio)
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

describe("señales de clientes (puras)", () => {
  it("mediana de intervalos entre visitas; varias compras el mismo día cuentan una", () => {
    expect(medianIntervalDays([ago(60), ago(48), ago(36), ago(24)])).toBe(12);
    expect(medianIntervalDays([ago(60), ago(60), ago(30)])).toBe(30);
    expect(medianIntervalDays([ago(5)])).toBeNull();
    // Una visita suelta muy espaciada no arrastra la mediana.
    expect(medianIntervalDays([ago(200), ago(40), ago(28), ago(16)])).toBe(12);
  });
  it("en riesgo: pasa de max(minDays, factor × intervalo) sin llegar a maxDays", () => {
    const base = { visitCount: 5, now: NOW, minVisits: 3, minDays: 21, factor: 2.5, maxDays: 180 };
    const every12 = [ago(80), ago(68), ago(56), ago(44), ago(32)];
    expect(atRiskDays({ ...base, lastVisitAt: ago(32), visits: every12 })).toBe(32); // 32 > max(21, 30)
    expect(atRiskDays({ ...base, lastVisitAt: ago(29), visits: every12.map((d) => new Date(d.getTime() + 3 * DAY)) })).toBeNull(); // 29 ≤ 30
    expect(atRiskDays({ ...base, lastVisitAt: ago(250), visits: every12 })).toBeNull(); // ya se dio por perdido
    expect(atRiskDays({ ...base, visitCount: 2, lastVisitAt: ago(40), visits: every12 })).toBeNull(); // no es habitual
    expect(atRiskDays({ ...base, lastVisitAt: null, visits: every12 })).toBeNull();
  });
});

describe("second_visit y customer_recovery", () => {
  let org: { id: string };
  const customers = () => prisma.customer.findMany({ where: { organizationId: org.id } });
  const executions = (key: string) => prisma.automationExecution.findMany({ where: { organizationId: org.id, automation: { blueprintKey: key } }, orderBy: { createdAt: "asc" } });
  const events = (type: string) => prisma.domainEvent.findMany({ where: { organizationId: org.id, type } });
  let n = 0;

  const customer = async (opts: { visits: Date[]; consent?: boolean; name?: string }) => {
    n++;
    const sorted = [...opts.visits].sort((a, b) => a.getTime() - b.getTime());
    const c = await prisma.customer.create({
      data: { organizationId: org.id, phone: `+52554000${String(n).padStart(4, "0")}`, phoneKey: `554000${String(n).padStart(4, "0")}`, name: opts.name ?? `Cliente ${n}`, consentAccepted: opts.consent ?? true, visitCount: sorted.length, firstVisitAt: sorted[0], lastVisitAt: sorted[sorted.length - 1] },
    });
    for (const at of sorted) await prisma.foodSale.create({ data: { organizationId: org.id, customerId: c.id, occurredAt: at, grossAmount: 100, netAmount: 86, source: "POS" } });
    return c;
  };
  const enable = (key: string, over: { dryRun?: boolean; config?: object } = {}) => {
    const bp = getBlueprint(key)!;
    return prisma.automation.create({ data: { organizationId: org.id, name: bp.name, type: "blueprint", webhookSecret: "s", blueprintKey: key, blueprintVersion: bp.version, trigger: bp.trigger, config: { ...bp.defaultConfig, ...(over.config ?? {}) } as object, dryRun: over.dryRun ?? true } });
  };

  beforeAll(async () => {
    org = await createTestOrg("Customer Detectors Org");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "REYMEN_POS", status: "ACTIVE", source: "SUBSCRIBED" } });
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });
  beforeEach(async () => {
    await prisma.automationExecution.deleteMany({ where: { organizationId: org.id } });
    await prisma.automation.deleteMany({ where: { organizationId: org.id } });
    await prisma.domainEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.foodSale.deleteMany({ where: { organizationId: org.id } });
    await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  });

  it("segunda visita: solo quien vino UNA vez, con consentimiento, entre afterDays y maxDays; una vez por cliente", async () => {
    const due = await customer({ visits: [ago(20)], name: "Ana" });
    await customer({ visits: [ago(5)] }); // muy reciente
    await customer({ visits: [ago(200)] }); // de hace años: no se le escribe
    await customer({ visits: [ago(20)], consent: false }); // sin consentimiento
    await customer({ visits: [ago(40), ago(20)] }); // ya regresó
    await enable("second_visit");
    expect((await runClockDetectors(NOW, { organizationId: org.id })).secondVisits).toBe(1);
    expect((await runClockDetectors(new Date(NOW.getTime() + 300_000), { organizationId: org.id })).secondVisits).toBe(0); // el tick no repite
    const [ev] = await events("customer.second_visit_due");
    expect(ev.subjectId).toBe(due.id);

    await runAutomationTick(NOW, { organizationId: org.id });
    const [ex] = await executions("second_visit");
    expect(ex).toMatchObject({ status: "DRY_RUN", subjectId: due.id });
    expect(ex.action).toMatchObject({ type: "message", templateKey: "second_visit_v1", variables: { name: "Ana" } });
  });

  it("segunda visita: si regresó antes de procesarse, se omite", async () => {
    const c = await customer({ visits: [ago(20)] });
    await enable("second_visit");
    await runClockDetectors(NOW, { organizationId: org.id });
    await prisma.customer.update({ where: { id: c.id }, data: { visitCount: 2, lastVisitAt: NOW } });
    await runAutomationTick(NOW, { organizationId: org.id });
    expect(await executions("second_visit")).toMatchObject([{ status: "SKIPPED", skipReason: "already_returned" }]);
  });

  it("recuperación: detecta al habitual que se alejó (no al que viene con su ritmo ni al de pocas visitas)", async () => {
    const away = await customer({ visits: [ago(80), ago(68), ago(56), ago(44), ago(32)], name: "Luis" }); // cada 12 días, lleva 32
    await customer({ visits: [ago(60), ago(48), ago(36), ago(24), ago(12)] }); // viene con su ritmo
    await customer({ visits: [ago(70), ago(30)] }); // 2 visitas: no es habitual
    await customer({ visits: [ago(80), ago(68), ago(56), ago(44), ago(32)], consent: false });
    await enable("customer_recovery");
    expect((await runClockDetectors(NOW, { organizationId: org.id })).atRisk).toBe(1);
    expect((await runClockDetectors(new Date(NOW.getTime() + 300_000), { organizationId: org.id })).atRisk).toBe(0);
    const [ev] = await events("customer.at_risk");
    expect(ev.payload).toMatchObject({ customerId: away.id, daysSince: 32 });

    await runAutomationTick(NOW, { organizationId: org.id });
    const [ex] = await executions("customer_recovery");
    expect(ex).toMatchObject({ status: "DRY_RUN", subjectId: away.id });
    expect(ex.action).toMatchObject({ templateKey: "customer_recovery_v1", variables: { name: "Luis", daysSince: "32" } });
  });

  it("recuperación: un episodio por ausencia; si regresa y se vuelve a alejar, es otro", async () => {
    const c = await customer({ visits: [ago(80), ago(68), ago(56), ago(44), ago(32)] });
    await enable("customer_recovery");
    await runClockDetectors(NOW, { organizationId: org.id });
    expect(await events("customer.at_risk")).toHaveLength(1);
    // Regresa hace 10 días y 60 días después vuelve a alejarse.
    await prisma.customer.update({ where: { id: c.id }, data: { visitCount: 6, lastVisitAt: ago(10) } });
    await prisma.foodSale.create({ data: { organizationId: org.id, customerId: c.id, occurredAt: ago(10), grossAmount: 100, netAmount: 86, source: "POS" } });
    expect((await runClockDetectors(new Date(NOW.getTime() + 45 * DAY), { organizationId: org.id })).atRisk).toBe(1);
    expect(await events("customer.at_risk")).toHaveLength(2);
  });

  it("recuperación: si regresó entre la detección y el procesamiento, se omite; con envío real queda PENDING", async () => {
    const c = await customer({ visits: [ago(80), ago(68), ago(56), ago(44), ago(32)] });
    await enable("customer_recovery", { dryRun: false });
    await runClockDetectors(NOW, { organizationId: org.id });
    await runAutomationTick(NOW, { organizationId: org.id });
    expect(await executions("customer_recovery")).toMatchObject([{ status: "PENDING" }]);

    await prisma.automationExecution.deleteMany({ where: { organizationId: org.id } });
    await prisma.domainEvent.updateMany({ where: { organizationId: org.id }, data: { status: "PENDING", nextAttemptAt: new Date(0) } });
    await prisma.customer.update({ where: { id: c.id }, data: { lastVisitAt: NOW } });
    await runAutomationTick(NOW, { organizationId: org.id });
    expect(await executions("customer_recovery")).toMatchObject([{ status: "SKIPPED", skipReason: "already_returned" }]);
  });

  it("sin la automatización habilitada o sin el módulo del POS no se detecta nada", async () => {
    await customer({ visits: [ago(20)] });
    expect(await runClockDetectors(NOW, { organizationId: org.id })).toMatchObject({ secondVisits: 0, atRisk: 0 });
    await enable("second_visit");
    await prisma.organizationModule.updateMany({ where: { organizationId: org.id, module: "REYMEN_POS" }, data: { status: "SUSPENDED" } });
    expect((await runClockDetectors(NOW, { organizationId: org.id })).secondVisits).toBe(0);
    await prisma.organizationModule.updateMany({ where: { organizationId: org.id, module: "REYMEN_POS" }, data: { status: "ACTIVE" } });
    expect(await customers()).toHaveLength(1);
  });
});
