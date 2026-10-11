// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { processFoodPosOrder } from "@/lib/food";
import { processDomainEvents } from "@/lib/domain-events";
import { runAutomationsForEvent } from "./engine";
import { getBlueprint, listBlueprints } from "./blueprints";

// Hora del tick: 15:00 en CDMX, fuera del horario de silencio (en el futuro, para que los eventos ya "toquen").
const DAY = new Date("2030-10-06T21:00:00Z");

describe("motor de automatizaciones (welcome_new_customer)", () => {
  let org: { id: string };
  let other: { id: string };
  let variantId: string;
  let automationId: string;
  const order = (extra: Record<string, unknown> = {}) => ({ grossAmount: 200, netAmount: 172, items: [{ variantId, quantity: 1 }], occurredAt: DAY.toISOString(), ...extra });
  const tick = (now = DAY) => processDomainEvents({ now, organizationId: org.id, consumers: [(e) => runAutomationsForEvent(e, now)] });
  const executions = () => prisma.automationExecution.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    org = await createTestOrg("Engine Org");
    other = await createTestOrg("Engine Other Org");
    for (const mod of ["FOOD_OPS", "REYMEN_POS"] as const) {
      await prisma.organizationModule.create({ data: { organizationId: org.id, module: mod, status: "ACTIVE", source: "SUBSCRIBED" } });
    }
    const dish = await prisma.foodDish.create({
      data: { organizationId: org.id, name: "Taco", variants: { create: [{ organizationId: org.id, label: "Único", price: 200 }] } },
      include: { variants: true },
    });
    variantId = dish.variants[0].id;
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(other.id);
  });
  beforeEach(async () => {
    await prisma.automationExecution.deleteMany({ where: { organizationId: org.id } });
    await prisma.automation.deleteMany({ where: { organizationId: org.id } });
    await prisma.domainEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.customer.deleteMany({ where: { organizationId: org.id } });
    await prisma.foodSale.deleteMany({ where: { organizationId: org.id } });
    const bp = getBlueprint("welcome_new_customer")!;
    const a = await prisma.automation.create({
      data: { organizationId: org.id, name: bp.name, type: "blueprint", webhookSecret: "s", blueprintKey: bp.key, blueprintVersion: bp.version, trigger: bp.trigger, config: { ...bp.defaultConfig } as object, dryRun: true },
    });
    automationId = a.id;
  });

  it("el catálogo expone el blueprint con su configuración por defecto", () => {
    expect(listBlueprints().map((b) => b.key)).toContain("welcome_new_customer");
    expect(getBlueprint("welcome_new_customer")!.defaultConfig).toMatchObject({ channel: "whatsapp", cooldownDays: 365 });
    expect(getBlueprint("nope")).toBeNull();
  });

  it("cliente nuevo con consentimiento en dry-run: registra 'se habría enviado' sin enviar", async () => {
    await processFoodPosOrder(order({ orderId: "W-1", customer: { phone: "55 4000 0001", name: "Ana", consent: { accepted: true, textVersion: "v1" } } }), org.id);
    await tick();
    const [ex] = await executions();
    expect(ex).toMatchObject({ status: "DRY_RUN", skipReason: null, subjectType: "customer", automationId });
    expect(ex.action).toMatchObject({ type: "message", channel: "whatsapp", templateKey: "welcome_new_customer_v1", recipient: { phone: "+525540000001", name: "Ana" } });
    const a = await prisma.automation.findUniqueOrThrow({ where: { id: automationId } });
    expect(a).toMatchObject({ lastStatus: "DRY_RUN" });
  });

  it("sin consentimiento se omite con su razón", async () => {
    await processFoodPosOrder(order({ orderId: "W-2", customer: { phone: "55 4000 0002", consent: { accepted: false } } }), org.id);
    await tick();
    expect(await executions()).toMatchObject([{ status: "SKIPPED", skipReason: "no_consent" }]);
  });

  it("con dry-run apagado la ejecución queda PENDING para el despachador", async () => {
    await prisma.automation.update({ where: { id: automationId }, data: { dryRun: false } });
    await processFoodPosOrder(order({ orderId: "W-3", customer: { phone: "55 4000 0003", consent: { accepted: true } } }), org.id);
    await tick();
    expect(await executions()).toMatchObject([{ status: "PENDING" }]);
  });

  it("horas de silencio: omite con quiet_hours", async () => {
    await processFoodPosOrder(order({ orderId: "W-4", customer: { phone: "55 4000 0004", consent: { accepted: true } } }), org.id);
    await tick(new Date("2030-10-07T04:00:00Z")); // 22:00 en CDMX
    expect(await executions()).toMatchObject([{ status: "SKIPPED", skipReason: "quiet_hours" }]);
  });

  it("reprocesar el mismo evento no crea una segunda ejecución", async () => {
    await processFoodPosOrder(order({ orderId: "W-5", customer: { phone: "55 4000 0005", consent: { accepted: true } } }), org.id);
    await tick();
    const event = await prisma.domainEvent.findFirstOrThrow({ where: { organizationId: org.id, type: "customer.created" } });
    await runAutomationsForEvent(event, DAY);
    await runAutomationsForEvent(event, DAY);
    expect(await executions()).toHaveLength(1);
  });

  it("ventas de clientes que ya existían no disparan la bienvenida de nuevo", async () => {
    await processFoodPosOrder(order({ orderId: "W-6", customer: { phone: "55 4000 0006", consent: { accepted: true } } }), org.id);
    await processFoodPosOrder(order({ orderId: "W-7", customer: { phone: "55 4000 0006" } }), org.id);
    await tick();
    expect(await executions()).toHaveLength(1);
  });

  it("automatización pausada, configuración inválida o módulo apagado", async () => {
    await prisma.automation.update({ where: { id: automationId }, data: { status: "PAUSED" } });
    await processFoodPosOrder(order({ orderId: "W-8", customer: { phone: "55 4000 0008", consent: { accepted: true } } }), org.id);
    await tick();
    expect(await executions()).toHaveLength(0);

    await prisma.automation.update({ where: { id: automationId }, data: { status: "ACTIVE", config: { cooldownDays: -5 } } });
    await processFoodPosOrder(order({ orderId: "W-9", customer: { phone: "55 4000 0009", consent: { accepted: true } } }), org.id);
    await prisma.domainEvent.updateMany({ where: { organizationId: org.id }, data: { status: "PENDING", nextAttemptAt: new Date(0) } });
    await tick();
    expect((await executions()).map((e) => e.skipReason)).toEqual(expect.arrayContaining(["invalid_config"]));

    await prisma.automation.update({ where: { id: automationId }, data: { config: {} } });
    await prisma.organizationModule.updateMany({ where: { organizationId: org.id, module: "REYMEN_POS" }, data: { status: "SUSPENDED" } });
    await processFoodPosOrder(order({ orderId: "W-10", customer: { phone: "55 4000 0010", consent: { accepted: true } } }), org.id);
    await tick();
    expect((await executions()).map((e) => e.skipReason)).toContain("module_disabled");
    await prisma.organizationModule.updateMany({ where: { organizationId: org.id, module: "REYMEN_POS" }, data: { status: "ACTIVE" } });
  });

  it("no mezcla organizaciones: la automatización de otra org no reacciona", async () => {
    const bp = getBlueprint("welcome_new_customer")!;
    const foreign = await prisma.automation.create({
      data: { organizationId: other.id, name: bp.name, type: "blueprint", webhookSecret: "s", blueprintKey: bp.key, blueprintVersion: bp.version, trigger: bp.trigger, config: { ...bp.defaultConfig } as object },
    });
    await processFoodPosOrder(order({ orderId: "W-11", customer: { phone: "55 4000 0011", consent: { accepted: true } } }), org.id);
    await tick();
    expect(await prisma.automationExecution.count({ where: { automationId: foreign.id } })).toBe(0);
  });
});
