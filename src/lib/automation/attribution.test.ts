// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { applyExecutionCallback } from "./callback";
import { callbackToken } from "./dispatcher";
import { attributeSale, reverseConversionForCancellation, getAttributionSummary, attributeEvent, ATTRIBUTION_WINDOW_DAYS } from "./attribution";

const DAY = 86_400_000;
const T0 = new Date("2030-10-01T18:00:00Z"); // momento del primer envío

describe("atribución de ingresos", () => {
  let org: { id: string };
  let customerId: string;
  let n = 0;
  const secret = "s3cret";

  beforeAll(async () => {
    process.env.N8N_WEBHOOK_SECRET = secret;
    org = await createTestOrg("Attribution Org");
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
  });
  beforeEach(async () => {
    await prisma.automationConversion.deleteMany({ where: { organizationId: org.id } });
    await prisma.automationTouch.deleteMany({ where: { organizationId: org.id } });
    await prisma.automationExecution.deleteMany({ where: { organizationId: org.id } });
    await prisma.domainEvent.deleteMany({ where: { organizationId: org.id } });
    await prisma.automation.deleteMany({ where: { organizationId: org.id } });
    await prisma.foodSale.deleteMany({ where: { organizationId: org.id } });
    await prisma.customer.deleteMany({ where: { organizationId: org.id } });
    n++;
    customerId = (await prisma.customer.create({ data: { organizationId: org.id, phone: `+52554200${String(n).padStart(4, "0")}`, phoneKey: `554200${String(n).padStart(4, "0")}`, name: "Ana", consentAccepted: true } })).id;
  });

  const automation = (key: string, version = 1) => prisma.automation.create({ data: { organizationId: org.id, name: key, type: "blueprint", webhookSecret: "s", blueprintKey: key, blueprintVersion: version, trigger: "x", dryRun: false } });
  /** Una ejecución de mensaje ya despachada; el callback de n8n la cierra y crea el contacto. */
  const sentExecution = async (automationId: string, at: Date, status: "sent" | "delivered" | "failed" | "skipped" = "sent") => {
    const event = await prisma.domainEvent.create({ data: { organizationId: org.id, type: "customer.created", subjectType: "customer", subjectId: customerId, occurredAt: at, dedupeKey: `e-${Math.random()}` } });
    const ex = await prisma.automationExecution.create({ data: { organizationId: org.id, automationId, domainEventId: event.id, subjectType: "customer", subjectId: customerId, status: "DISPATCHED", action: { type: "message", channel: "whatsapp", templateKey: "t" } } });
    await applyExecutionCallback({ executionId: ex.id, token: callbackToken(ex.id, secret), status }, at);
    return ex;
  };
  const sale = (at: Date, gross: number, over: Record<string, unknown> = {}) => prisma.foodSale.create({ data: { organizationId: org.id, customerId, occurredAt: at, grossAmount: gross, netAmount: Math.round(gross * 0.86 * 100) / 100, source: "POS", ...over } });

  it("un envío exitoso queda como contacto; uno fallido u omitido no; el callback repetido no duplica", async () => {
    const a = await automation("second_visit");
    const ok = await sentExecution(a.id, T0, "sent");
    await sentExecution(a.id, new Date(T0.getTime() + 1000), "failed");
    await sentExecution(a.id, new Date(T0.getTime() + 2000), "skipped");
    const touches = await prisma.automationTouch.findMany({ where: { organizationId: org.id } });
    expect(touches).toHaveLength(1);
    expect(touches[0]).toMatchObject({ executionId: ok.id, customerId, channel: "whatsapp", conversionWindowDays: ATTRIBUTION_WINDOW_DAYS });
    await applyExecutionCallback({ executionId: ok.id, token: callbackToken(ok.id, secret), status: "delivered" }, T0);
    expect(await prisma.automationTouch.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("atribuye la venta al contacto con ventana abierta, con el monto NETO y la versión de la regla", async () => {
    const a = await automation("customer_recovery", 3);
    const ex = await sentExecution(a.id, T0);
    const s = await sale(new Date(T0.getTime() + 2 * DAY), 200);
    expect(await attributeSale(org.id, s.id)).toBe("attributed");
    const [c] = await prisma.automationConversion.findMany({ where: { organizationId: org.id } });
    expect(c).toMatchObject({ saleId: s.id, automationId: a.id, executionId: ex.id, ruleVersion: 3, customerId });
    expect(Number(c.attributedRevenue)).toBe(172);
    expect(await attributeSale(org.id, s.id)).toBe("none"); // idempotente
  });

  it("no atribuye: fuera de la ventana, venta anterior al envío, sin cliente o venta en negativo", async () => {
    const a = await automation("second_visit");
    await sentExecution(a.id, T0);
    const late = await sale(new Date(T0.getTime() + (ATTRIBUTION_WINDOW_DAYS + 1) * DAY), 100);
    const before = await sale(new Date(T0.getTime() - 3600_000), 100); // mismo día, antes del envío
    const anonymous = await sale(new Date(T0.getTime() + DAY), 100, { customerId: null });
    const negative = await sale(new Date(T0.getTime() + DAY), -50);
    for (const s of [late, before, anonymous, negative]) expect(await attributeSale(org.id, s.id)).toBe("none");
    expect(await prisma.automationConversion.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("con varios contactos gana el ÚLTIMO, y una venta se atribuye a una sola automatización", async () => {
    const first = await automation("second_visit");
    const last = await automation("customer_recovery");
    await sentExecution(first.id, T0);
    await sentExecution(last.id, new Date(T0.getTime() + 2 * DAY));
    const s = await sale(new Date(T0.getTime() + 3 * DAY), 100);
    await attributeSale(org.id, s.id);
    const conversions = await prisma.automationConversion.findMany({ where: { organizationId: org.id } });
    expect(conversions).toHaveLength(1);
    expect(conversions[0].automationId).toBe(last.id);
  });

  it("una cancelación total revierte la conversión (la fila se conserva); una parcial solo la reduce", async () => {
    const a = await automation("second_visit");
    await sentExecution(a.id, T0);
    const s1 = await sale(new Date(T0.getTime() + DAY), 100); // neto 86
    const s2 = await sale(new Date(T0.getTime() + 2 * DAY), 100);
    await attributeSale(org.id, s1.id);
    await attributeSale(org.id, s2.id);

    const partial = await sale(new Date(T0.getTime() + 3 * DAY), -50, { cancelsSaleId: s2.id }); // neto -43
    expect(await reverseConversionForCancellation(org.id, partial.id)).toBe("reduced");
    expect(Number((await prisma.automationConversion.findUniqueOrThrow({ where: { organizationId_saleId: { organizationId: org.id, saleId: s2.id } } })).attributedRevenue)).toBe(43);

    const total = await sale(new Date(T0.getTime() + 3 * DAY), -100, { cancelsSaleId: s1.id });
    expect(await reverseConversionForCancellation(org.id, total.id)).toBe("reverted");
    const reverted = await prisma.automationConversion.findUniqueOrThrow({ where: { organizationId_saleId: { organizationId: org.id, saleId: s1.id } } });
    expect(reverted).toMatchObject({ revertedBySaleId: total.id });
    expect(reverted.revertedAt).not.toBeNull();
    expect(await reverseConversionForCancellation(org.id, total.id)).toBe("none"); // ya revertida
  });

  it("el consumidor de eventos atribuye con sale.completed y revierte con sale.cancelled", async () => {
    const a = await automation("second_visit");
    await sentExecution(a.id, T0);
    const s = await sale(new Date(T0.getTime() + DAY), 100);
    const ev = (type: string, saleId: string) => prisma.domainEvent.create({ data: { organizationId: org.id, type, subjectType: "sale", subjectId: saleId, occurredAt: new Date(), payload: { saleId }, dedupeKey: `ev-${Math.random()}` } });
    await attributeEvent(await ev("sale.completed", s.id));
    expect(await prisma.automationConversion.count({ where: { organizationId: org.id, revertedAt: null } })).toBe(1);
    const cancel = await sale(new Date(T0.getTime() + 2 * DAY), -100, { cancelsSaleId: s.id });
    await attributeEvent(await ev("sale.cancelled", cancel.id));
    expect(await prisma.automationConversion.count({ where: { organizationId: org.id, revertedAt: null } })).toBe(0);
  });

  it("el resumen cuenta contactos, ventas e ingresos asociados (sin revertidos) y no mezcla organizaciones", async () => {
    const a = await automation("second_visit");
    await sentExecution(a.id, T0);
    const s1 = await sale(new Date(T0.getTime() + DAY), 100);
    const s2 = await sale(new Date(T0.getTime() + 2 * DAY), 200);
    await attributeSale(org.id, s1.id);
    await attributeSale(org.id, s2.id);
    const now = new Date(T0.getTime() + 3 * DAY);
    expect(await getAttributionSummary(org.id, 30, now)).toEqual([{ automationId: a.id, name: "second_visit", touches: 1, conversions: 2, revenue: 258 }]);
    const cancel = await sale(new Date(T0.getTime() + 3 * DAY), -100, { cancelsSaleId: s1.id });
    await reverseConversionForCancellation(org.id, cancel.id);
    expect((await getAttributionSummary(org.id, 30, now))[0]).toMatchObject({ conversions: 1, revenue: 172 });
    const other = await createTestOrg("Attribution Other");
    try {
      expect(await getAttributionSummary(other.id, 30, now)).toEqual([]);
    } finally {
      await cleanupOrg(other.id);
    }
  });
});
