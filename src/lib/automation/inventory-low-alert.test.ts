// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { applyStockMovements, stockLevel } from "@/lib/food-inventory";
import { processDomainEvents } from "@/lib/domain-events";
import { runAutomationsForEvent } from "./engine";
import { getBlueprint } from "./blueprints";

describe("niveles de existencia (puro)", () => {
  it("bajo cuando llega al mínimo; crítico en cero, negativo o a un cuarto del mínimo", () => {
    expect(stockLevel(10, 5)).toBe("ok");
    expect(stockLevel(5, 5)).toBe("low");
    expect(stockLevel(2, 5)).toBe("low");
    expect(stockLevel(1.25, 5)).toBe("critical");
    expect(stockLevel(0, 5)).toBe("critical");
    expect(stockLevel(-3, 5)).toBe("critical");
  });
  it("sin mínimo configurado solo alerta cuando se agota", () => {
    expect(stockLevel(2, 0)).toBe("ok");
    expect(stockLevel(0, 0)).toBe("critical");
  });
});

describe("inventory_low_alert", () => {
  let org: { id: string };
  let itemId: string;
  const events = () => prisma.domainEvent.findMany({ where: { organizationId: org.id, type: "inventory.level_changed" }, orderBy: { createdAt: "asc" } });
  const move = (delta: number) => prisma.$transaction((tx) => applyStockMovements(tx, org.id, [{ inventoryItemId: itemId, delta }], { type: "ADJUSTMENT" }));
  const tick = () => processDomainEvents({ now: new Date(Date.now() + 60_000), organizationId: org.id, consumers: [(e) => runAutomationsForEvent(e)] });

  beforeAll(async () => {
    org = await createTestOrg("Inventory Alert Org");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });
  beforeEach(async () => {
    await prisma.automationExecution.deleteMany({ where: { organizationId: org.id } });
    await prisma.automation.deleteMany({ where: { organizationId: org.id } });
    await prisma.domainEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.foodInventoryMovement.deleteMany({ where: { organizationId: org.id } });
    await prisma.foodInventoryItem.deleteMany({ where: { organizationId: org.id } });
    const item = await prisma.foodInventoryItem.create({ data: { organizationId: org.id, name: "Tomate", unit: "kg", currentStock: 20, minStock: 8 } });
    itemId = item.id;
  });

  const enable = async (over: { dryRun?: boolean; config?: object } = {}) => {
    const bp = getBlueprint("inventory_low_alert")!;
    return prisma.automation.create({
      data: { organizationId: org.id, name: bp.name, type: "blueprint", webhookSecret: "s", blueprintKey: bp.key, blueprintVersion: bp.version, trigger: bp.trigger, config: { ...bp.defaultConfig, ...(over.config ?? {}) } as object, dryRun: over.dryRun ?? false },
    });
  };

  it("emite el evento solo al EMPEORAR de nivel: ok→bajo, bajo→crítico; no repite ni cuando mejora", async () => {
    await move(-5); // 15: ok
    expect(await events()).toHaveLength(0);
    await move(-8); // 7: bajo (≤ 8)
    await move(-1); // 6: sigue bajo → no avisa
    await move(-5); // 1: crítico (≤ 25 % de 8 = 2)
    await move(-1); // 0: sigue crítico → no avisa
    await move(+30); // 30: se recupera → no avisa
    const found = await events();
    expect(found.map((e) => (e.payload as { level: string }).level)).toEqual(["low", "critical"]);
    expect(found[0].payload).toMatchObject({ name: "Tomate", unit: "kg", currentStock: 7, minStock: 8 });
    // Tras recuperarse, volver a bajar vuelve a avisar (nuevo episodio).
    await move(-29); // 1: ok → crítico directo
    expect((await events()).map((e) => (e.payload as { level: string }).level)).toEqual(["low", "critical", "critical"]);
  });

  it("un insumo desactivado no avisa", async () => {
    await prisma.foodInventoryItem.update({ where: { id: itemId }, data: { isActive: false } });
    await move(-19);
    expect(await events()).toHaveLength(0);
  });

  it("con la automatización activa deja un aviso interno (sin contactar a nadie) que muestra la campana", async () => {
    const auto = await enable();
    await move(-13); // 7: bajo
    await tick();
    const [ex] = await prisma.automationExecution.findMany({ where: { automationId: auto.id } });
    expect(ex).toMatchObject({ status: "SUCCEEDED", subjectType: "inventory_item", subjectId: itemId });
    expect(ex.action).toMatchObject({ type: "alert", severity: "warning", title: "Tomate: por debajo del mínimo", href: "/portal/food/inventory" });
    expect((ex.action as { body: string }).body).toBe("Quedan 7 kg (mínimo 8).");
    // La consulta de la campana lo encuentra.
    expect(await prisma.automationExecution.count({ where: { organizationId: org.id, status: "SUCCEEDED", action: { path: ["type"], equals: "alert" } } })).toBe(1);
  });

  it("nivel crítico = alerta crítica; reprocesar el mismo evento no duplica el aviso", async () => {
    const auto = await enable();
    await move(-20); // 0: crítico
    await tick();
    const event = (await events())[0];
    await runAutomationsForEvent(event);
    const list = await prisma.automationExecution.findMany({ where: { automationId: auto.id } });
    expect(list).toHaveLength(1);
    expect(list[0].action).toMatchObject({ severity: "critical", title: "Tomate: nivel crítico" });
  });

  it("minLevel=critical ignora el nivel bajo", async () => {
    const auto = await enable({ config: { minLevel: "critical" } });
    await move(-13); // bajo
    await move(-6); // 1: crítico
    await tick();
    const list = await prisma.automationExecution.findMany({ where: { automationId: auto.id }, orderBy: { createdAt: "asc" } });
    expect(list.map((e) => [e.status, e.skipReason])).toEqual([["SKIPPED", "below_min_level"], ["SUCCEEDED", null]]);
  });

  it("en dry-run solo registra lo que se habría avisado (la campana no lo muestra)", async () => {
    const auto = await enable({ dryRun: true });
    await move(-13);
    await tick();
    const [ex] = await prisma.automationExecution.findMany({ where: { automationId: auto.id } });
    expect(ex.status).toBe("DRY_RUN");
    expect(await prisma.automationExecution.count({ where: { organizationId: org.id, status: "SUCCEEDED" } })).toBe(0);
  });

  it("exige el módulo Reymen Foods", async () => {
    const auto = await enable();
    await prisma.organizationModule.updateMany({ where: { organizationId: org.id, module: "FOOD_OPS" }, data: { status: "SUSPENDED" } });
    await move(-13);
    await tick();
    expect((await prisma.automationExecution.findMany({ where: { automationId: auto.id } })).map((e) => e.skipReason)).toEqual(["module_disabled"]);
    await prisma.organizationModule.updateMany({ where: { organizationId: org.id, module: "FOOD_OPS" }, data: { status: "ACTIVE" } });
  });
});
