// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { isControlGroup, groupStats, computeLift, MIN_GROUP_SIZE, CONTROL_REASON } from "./control-group";
import { runAutomationsForEvent } from "./engine";
import { processDomainEvents } from "@/lib/domain-events";
import { getBlueprint } from "./blueprints";

const DAY = 86_400_000;
const T0 = new Date("2030-10-01T21:00:00Z"); // 15:00 CDMX

describe("asignación al grupo de control (pura)", () => {
  it("es determinista: el mismo cliente en la misma automatización siempre cae en el mismo grupo", () => {
    for (let i = 0; i < 20; i++) expect(isControlGroup("a1", `c${i}`, 10)).toBe(isControlGroup("a1", `c${i}`, 10));
  });
  it("0 % nunca es control; 100 % siempre; y el porcentaje real se acerca al configurado", () => {
    expect(isControlGroup("a1", "c1", 0)).toBe(false);
    expect(isControlGroup("a1", "c1", 100)).toBe(true);
    const n = 4000;
    const hits = Array.from({ length: n }, (_, i) => isControlGroup("auto-x", `cliente-${i}`, 10)).filter(Boolean).length;
    expect(hits / n).toBeGreaterThan(0.08);
    expect(hits / n).toBeLessThan(0.12);
  });
  it("otra automatización reparte distinto (no son siempre los mismos clientes de control)", () => {
    const a = Array.from({ length: 300 }, (_, i) => isControlGroup("auto-a", `c${i}`, 20));
    const b = Array.from({ length: 300 }, (_, i) => isControlGroup("auto-b", `c${i}`, 20));
    expect(a.filter((x, i) => x && b[i]).length).toBeLessThan(a.filter(Boolean).length);
  });
});

describe("tasa de regreso por grupo (pura)", () => {
  it("cuenta como regreso una compra dentro de la ventana SIGUIENTE a la referencia; ignora anteriores y tardías", () => {
    const refs = [{ customerId: "a", at: T0 }, { customerId: "b", at: T0 }, { customerId: "c", at: T0 }];
    const sales = [
      { customerId: "a", occurredAt: new Date(T0.getTime() + 2 * DAY), netAmount: 100 }, // regresa
      { customerId: "b", occurredAt: new Date(T0.getTime() - DAY), netAmount: 50 }, // anterior: no cuenta
      { customerId: "c", occurredAt: new Date(T0.getTime() + 9 * DAY), netAmount: 80 }, // fuera de la ventana de 7 días
    ];
    expect(groupStats(refs, sales, 7)).toEqual({ customers: 3, returned: 1, rate: 33.3, revenuePerCustomer: 33.33 });
    expect(groupStats([], [], 7)).toEqual({ customers: 0, returned: 0, rate: 0, revenuePerCustomer: 0 });
  });
});

describe("grupo de control en el motor y prueba de incrementalidad", () => {
  let org: { id: string };
  let n = 0;
  const tick = (now = T0) => processDomainEvents({ now, organizationId: org.id, consumers: [(e) => runAutomationsForEvent(e, now)] });

  beforeAll(async () => {
    org = await createTestOrg("Control Group Org");
    for (const mod of ["FOOD_OPS", "REYMEN_POS"] as const) await prisma.organizationModule.create({ data: { organizationId: org.id, module: mod, status: "ACTIVE", source: "SUBSCRIBED" } });
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });
  beforeEach(async () => {
    await prisma.automationTouch.deleteMany({ where: { organizationId: org.id } });
    await prisma.automationExecution.deleteMany({ where: { organizationId: org.id } });
    await prisma.domainEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.automation.deleteMany({ where: { organizationId: org.id } });
    await prisma.foodSale.deleteMany({ where: { organizationId: org.id } });
    await prisma.customer.deleteMany({ where: { organizationId: org.id } });
  });

  const enable = (pct: number, dryRun = false) => {
    const bp = getBlueprint("second_visit")!;
    return prisma.automation.create({ data: { organizationId: org.id, name: bp.name, type: "blueprint", webhookSecret: "s", blueprintKey: bp.key, blueprintVersion: bp.version, trigger: bp.trigger, config: { ...bp.defaultConfig, controlGroupPct: pct } as object, dryRun } });
  };
  const customerEvent = async (automationId: string, i = ++n) => {
    const c = await prisma.customer.create({ data: { organizationId: org.id, phone: `+52554500${String(i).padStart(4, "0")}`, phoneKey: `554500${String(i).padStart(4, "0")}`, name: `C${i}`, consentAccepted: true, visitCount: 1 } });
    await prisma.domainEvent.create({ data: { organizationId: org.id, type: "customer.second_visit_due", subjectType: "customer", subjectId: c.id, occurredAt: new Date(T0.getTime() - 1000), payload: { customerId: c.id }, dedupeKey: `sv:${c.id}` } });
    return c;
  };

  it("con 0 % nadie queda fuera; con 100 % todos quedan en control (sin mensaje) y la ejecución lo dice", async () => {
    const off = await enable(0);
    await customerEvent(off.id);
    await tick();
    expect((await prisma.automationExecution.findFirstOrThrow({ where: { automationId: off.id } })).status).toBe("PENDING");

    await prisma.automationExecution.deleteMany({ where: { organizationId: org.id } });
    await prisma.domainEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.automation.update({ where: { id: off.id }, data: { config: { ...(off.config as object), controlGroupPct: 50 } } });
    for (let i = 0; i < 30; i++) await customerEvent(off.id);
    await tick();
    const all = await prisma.automationExecution.findMany({ where: { automationId: off.id } });
    const control = all.filter((e) => e.skipReason === CONTROL_REASON);
    expect(all).toHaveLength(30);
    expect(control.length).toBeGreaterThan(5);
    expect(control.length).toBeLessThan(25);
    expect(all.filter((e) => e.status === "PENDING").length + control.length).toBe(30); // los demás sí se mandan
    expect(control.every((e) => e.status === "SKIPPED" && e.action === null)).toBe(true);
  });

  it("el control cuenta para el enfriamiento: un segundo evento del mismo cliente no lo vuelve a contar", async () => {
    const a = await enable(50);
    // Un cliente que caiga en el control (con 50 % basta con probar unos cuantos).
    let c = await customerEvent(a.id);
    while (!isControlGroup(a.id, c.id, 50)) {
      await prisma.domainEvent.deleteMany({ where: { organizationId: org.id } });
      c = await customerEvent(a.id);
    }
    await tick();
    await prisma.automationExecution.updateMany({ where: { automationId: a.id }, data: { createdAt: T0 } });
    await prisma.domainEvent.create({ data: { organizationId: org.id, type: "customer.second_visit_due", subjectType: "customer", subjectId: c.id, occurredAt: new Date(T0.getTime() - 500), payload: { customerId: c.id }, dedupeKey: `sv2:${c.id}` } });
    await tick();
    expect((await prisma.automationExecution.findMany({ where: { automationId: a.id }, orderBy: { createdAt: "asc" } })).map((e) => e.skipReason).sort()).toEqual(["control_group", "cooldown"]);
  });

  it("calcula el efecto: tratados vs. control, con muestra insuficiente avisada", async () => {
    const a = await enable(10);
    const mkCustomer = async () => prisma.customer.create({ data: { organizationId: org.id, phone: `+52554600${String(++n).padStart(4, "0")}`, phoneKey: `554600${String(n).padStart(4, "0")}`, name: "X", consentAccepted: true, visitCount: 1 } });
    const now = new Date(T0.getTime() + 20 * DAY);
    // 40 tratados (20 regresan) y 40 de control (8 regresan).
    for (let i = 0; i < 40; i++) {
      const c = await mkCustomer();
      const ex = await prisma.automationExecution.create({ data: { organizationId: org.id, automationId: a.id, domainEventId: (await prisma.domainEvent.create({ data: { organizationId: org.id, type: "t", subjectType: "customer", subjectId: c.id, occurredAt: T0, dedupeKey: `t:${c.id}` } })).id, subjectType: "customer", subjectId: c.id, status: "SUCCEEDED", createdAt: T0 } });
      await prisma.automationTouch.create({ data: { organizationId: org.id, customerId: c.id, automationId: a.id, executionId: ex.id, channel: "whatsapp", touchedAt: T0 } });
      if (i < 20) await prisma.foodSale.create({ data: { organizationId: org.id, customerId: c.id, occurredAt: new Date(T0.getTime() + 2 * DAY), grossAmount: 100, netAmount: 86, source: "POS" } });
    }
    for (let i = 0; i < 40; i++) {
      const c = await mkCustomer();
      await prisma.automationExecution.create({ data: { organizationId: org.id, automationId: a.id, domainEventId: (await prisma.domainEvent.create({ data: { organizationId: org.id, type: "t", subjectType: "customer", subjectId: c.id, occurredAt: T0, dedupeKey: `c:${c.id}` } })).id, subjectType: "customer", subjectId: c.id, status: "SKIPPED", skipReason: CONTROL_REASON, createdAt: T0 } });
      if (i < 8) await prisma.foodSale.create({ data: { organizationId: org.id, customerId: c.id, occurredAt: new Date(T0.getTime() + 3 * DAY), grossAmount: 100, netAmount: 86, source: "POS" } });
    }
    const lift = await computeLift(org.id, a.id, 90, now);
    expect(lift.treated).toMatchObject({ customers: 40, returned: 20, rate: 50 });
    expect(lift.control).toMatchObject({ customers: 40, returned: 8, rate: 20 });
    expect(lift.liftPoints).toBe(30);
    expect(lift.reliable).toBe(true);
    expect(MIN_GROUP_SIZE).toBe(30);
    // Con pocos clientes, la diferencia no es concluyente.
    await prisma.automationTouch.deleteMany({ where: { organizationId: org.id } });
    expect((await computeLift(org.id, a.id, 90, now)).reliable).toBe(false);
  });
});
