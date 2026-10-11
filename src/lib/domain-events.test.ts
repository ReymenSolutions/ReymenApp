// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { processFoodPosOrder } from "./food";
import { emitDomainEvent, processDomainEvents, purgeProcessedDomainEvents, MAX_ATTEMPTS, RETRY_BACKOFF_MINUTES } from "./domain-events";
import { runAutomationTick } from "./automation-tick";

describe("bandeja de eventos de dominio", () => {
  let org: { id: string };
  let other: { id: string };
  let variantId: string;
  const order = (extra: Record<string, unknown> = {}, gross = 200) => ({ grossAmount: gross, netAmount: gross / 1.16, items: [{ variantId, quantity: gross > 0 ? 1 : -1 }], ...extra });
  const events = (organizationId = org.id) => prisma.domainEvent.findMany({ where: { organizationId }, orderBy: { createdAt: "asc" } });

  beforeAll(async () => {
    org = await createTestOrg("Events Org");
    other = await createTestOrg("Events Other Org");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "SUBSCRIBED" } });
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
    await prisma.domainEvent.deleteMany({ where: { organizationId: { in: [org.id, other.id] } } });
  });

  it("una venta deja un solo sale.completed, también si el mismo pedido se reenvía", async () => {
    await processFoodPosOrder(order({ orderId: "E-1" }), org.id);
    await processFoodPosOrder(order({ orderId: "E-1" }), org.id);
    const list = await events();
    expect(list.map((e) => e.type)).toEqual(["sale.completed"]);
    expect(list[0]).toMatchObject({ status: "PENDING", subjectType: "sale", correlationId: "E-1", dedupeKey: "sale.completed:E-1" });
  });

  it("un cliente nuevo emite customer.created una sola vez; una cancelación emite sale.cancelled", async () => {
    await processFoodPosOrder(order({ orderId: "E-2", customer: { phone: "55 9999 0001", name: "Ana" } }), org.id);
    await processFoodPosOrder(order({ orderId: "E-3", customer: { phone: "55 9999 0001" } }), org.id);
    await processFoodPosOrder(order({ orderId: "E-3" }, -200), org.id);
    const types = (await events()).map((e) => e.type).sort();
    expect(types).toEqual(["customer.created", "sale.cancelled", "sale.completed", "sale.completed"]);
  });

  it("si la venta falla no queda ningún evento", async () => {
    await expect(processFoodPosOrder({ grossAmount: 100, netAmount: 90, items: [{ variantId: "no-existe", quantity: 1 }], orderId: "E-4" }, org.id)).rejects.toThrow();
    expect(await events()).toHaveLength(0);
  });

  it("emitDomainEvent es idempotente por organización + dedupeKey", async () => {
    const base = { type: "x.y", subjectType: "t", subjectId: "1", occurredAt: new Date(), dedupeKey: "k" };
    await prisma.$transaction(async (tx) => {
      await emitDomainEvent(tx, { ...base, organizationId: org.id });
      await emitDomainEvent(tx, { ...base, organizationId: org.id });
      await emitDomainEvent(tx, { ...base, organizationId: other.id });
    });
    expect(await events()).toHaveLength(1);
    expect(await events(other.id)).toHaveLength(1);
  });

  it("procesa los pendientes, en orden, y los marca PROCESSED", async () => {
    const t = new Date("2026-10-01T10:00:00Z");
    await prisma.$transaction(async (tx) => {
      await emitDomainEvent(tx, { organizationId: org.id, type: "a", subjectType: "t", subjectId: "1", occurredAt: new Date(t.getTime() + 1000), dedupeKey: "2" });
      await emitDomainEvent(tx, { organizationId: org.id, type: "b", subjectType: "t", subjectId: "1", occurredAt: t, dedupeKey: "1" });
    });
    const seen: string[] = [];
    const res = await processDomainEvents({ organizationId: org.id, consumers: [async (e) => void seen.push(e.type)] });
    expect(res).toMatchObject({ processed: 2, failed: 0, retried: 0 });
    expect(seen).toEqual(["b", "a"]);
    expect((await events()).every((e) => e.status === "PROCESSED" && e.processedAt)).toBe(true);
    expect((await processDomainEvents({ organizationId: org.id, consumers: [] })).processed).toBe(0);
  });

  it("un consumidor que falla reintenta con backoff y al agotarse queda FAILED", async () => {
    await prisma.$transaction((tx) => emitDomainEvent(tx, { organizationId: org.id, type: "boom", subjectType: "t", subjectId: "1", occurredAt: new Date(), dedupeKey: "boom" }));
    const failing = async () => {
      throw new Error("n8n caído");
    };
    let now = new Date();
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      const res = await processDomainEvents({ now, organizationId: org.id, consumers: [failing] });
      expect(res.retried).toBe(1);
      const ev = (await events())[0];
      expect(ev).toMatchObject({ status: "PENDING", attempts: i, error: "n8n caído" });
      expect(ev.nextAttemptAt.getTime()).toBe(now.getTime() + RETRY_BACKOFF_MINUTES[i - 1] * 60_000);
      // Antes de que toque el reintento no se vuelve a tomar.
      expect((await processDomainEvents({ now, organizationId: org.id, consumers: [failing] })).retried).toBe(0);
      now = new Date(ev.nextAttemptAt.getTime() + 1);
    }
    expect((await processDomainEvents({ now, organizationId: org.id, consumers: [failing] })).failed).toBe(1);
    expect((await events())[0]).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });
  });

  it("purga solo los procesados de más de 90 días", async () => {
    const old = new Date(Date.now() - 100 * 86_400_000);
    await prisma.domainEvent.createMany({
      data: [
        { organizationId: org.id, type: "a", subjectType: "t", subjectId: "1", occurredAt: old, dedupeKey: "old-ok", status: "PROCESSED", processedAt: old },
        { organizationId: org.id, type: "a", subjectType: "t", subjectId: "1", occurredAt: old, dedupeKey: "old-pending", status: "PENDING" },
        { organizationId: org.id, type: "a", subjectType: "t", subjectId: "1", occurredAt: new Date(), dedupeKey: "new-ok", status: "PROCESSED", processedAt: new Date() },
      ],
    });
    expect(await purgeProcessedDomainEvents()).toBeGreaterThanOrEqual(1);
    expect((await events()).map((e) => e.dedupeKey).sort()).toEqual(["new-ok", "old-pending"]);
  });

  it("el tick procesa la bandeja y no corre dos a la vez", async () => {
    await prisma.$transaction((tx) => emitDomainEvent(tx, { organizationId: org.id, type: "a", subjectType: "t", subjectId: "1", occurredAt: new Date(), dedupeKey: "tick" }));
    const res = await runAutomationTick(new Date(), { organizationId: org.id });
    expect(res.ran).toBe(true);
    // Mientras otra transacción sostiene el candado, el tick responde "locked".
    let locked: Awaited<ReturnType<typeof runAutomationTick>> | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(7204001)`;
      locked = await runAutomationTick(new Date(), { organizationId: org.id });
    });
    expect(locked).toEqual({ ran: false, reason: "locked" });
  });
});
