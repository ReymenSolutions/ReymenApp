// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { emitDomainEvent, processDomainEvents } from "@/lib/domain-events";
import { enrollMember, saveProgram, redeemReward, registerVisit } from "./service";
import { consumeLoyaltyEvent } from "./events";
import { reconcileLoyaltyMember } from "./reconcile";
import { dispatchPendingExecutions } from "@/lib/automation/dispatcher";
import { purgePosSales } from "@/lib/food-purge";
import { runAutomationsForEvent } from "@/lib/automation/engine";
import { POST as orders } from "@/app/api/webhooks/pos/orders/route";
import { POST as lookup } from "@/app/api/webhooks/pos/loyalty/route";

let seq = 0;
const orgs: string[] = [];
type Org = Awaited<ReturnType<typeof createTestOrg>>;
function request(url: string, org: Org, body: unknown, eventId = `event-${++seq}`) {
  const raw = JSON.stringify(body), timestamp = String(Date.now());
  return new NextRequest(`http://localhost${url}`, { method: "POST", body: raw,
    headers: { "x-reymen-signature": createWebhookSignature(raw, org.n8nWebhookSecret, timestamp), "x-reymen-timestamp": timestamp, "x-reymen-orgid": org.id, "x-reymen-event-id": eventId } });
}
async function setup() {
  const org = await createTestOrg("Loyalty event integration"); orgs.push(org.id);
  await prisma.organizationModule.createMany({ data: (["LOYALTY", "FOOD_OPS", "REYMEN_POS"] as const).map(module => ({ organizationId: org.id, module })) });
  const staff = await createTestUser(org.id, "OWNER", "loyalty-events");
  await saveProgram(org.id, staff.id, { name: "Club", description: null, status: "ACTIVE", visitGoal: 2, rewardType: "FREE_ITEM", rewardName: "Café", rewardDescription: null, rewardHeadline: null, scope: "ORGANIZATION", branchId: null });
  const phone = "8155500001";
  const enrollment = await enrollMember(org.slug, { name: "Ana Ejemplo", whatsapp: phone, postalCode: "64610", email: null, branchId: null, consent: true });
  if (enrollment.status !== "created") throw new Error("enrollment");
  const member = await prisma.loyaltyMember.findUniqueOrThrow({ where: { publicToken: enrollment.token } });
  const dish = await prisma.foodDish.create({ data: { organizationId: org.id, name: "Café", variants: { create: { organizationId: org.id, label: "Normal", price: 100 } } }, include: { variants: true } });
  const base = Date.now() + 60_000;
  const at = (minute: number) => new Date(base + minute * 60_000);
  const sale = async (orderId: string, minute: number, amount = 100, eventId?: string) => {
    const result = await orders(request("/api/webhooks/pos/orders", org, { orderId, occurredAt: at(minute).toISOString(), grossAmount: amount, netAmount: amount / 1.16,
      customer: { phone, name: "Ana" }, items: [{ variantId: dish.variants[0].id, quantity: amount < 0 ? -1 : 1 }] }, eventId));
    expect(result.status).toBe(200);
    return prisma.domainEvent.findFirstOrThrow({ where: { organizationId: org.id, type: amount < 0 ? "sale.cancelled" : "sale.completed", correlationId: orderId } });
  };
  const state = () => prisma.loyaltyMember.findUniqueOrThrow({ where: { id: member.id }, include: { rewards: { orderBy: { cycleNumber: "asc" } }, visits: true } });
  return { org, staff, member, phone, sale, at, state };
}
afterAll(async () => { for (const id of orgs) await cleanupOrg(id); });

describe("Loyalty durable event integration", () => {
  let a: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => { a = await setup(); });
  it("sale commits with no synchronous loyalty; replay and concurrent workers award exactly once", async () => {
    const event = await a.sale("first", 0);
    expect((await a.state()).totalVisits).toBe(0);
    await Promise.all([consumeLoyaltyEvent(event), consumeLoyaltyEvent(event)]);
    expect((await a.state()).totalVisits).toBe(1);
    expect(await prisma.loyaltyEventReceipt.count({ where: { organizationId: a.org.id, eventId: event.id } })).toBe(1);
    await prisma.$transaction(tx => emitDomainEvent(tx, { organizationId: a.org.id, type: event.type, subjectType: "sale", subjectId: event.subjectId, occurredAt: event.occurredAt, dedupeKey: "new-delivery-same-sale" }));
    await consumeLoyaltyEvent(await prisma.domainEvent.findFirstOrThrow({ where: { organizationId: a.org.id, dedupeKey: "new-delivery-same-sale" } }));
    expect((await a.state()).totalVisits).toBe(1);
  });
  it("rewards, double redemption, cancellation after redemption and compensation preserve history", async () => {
    await consumeLoyaltyEvent(await a.sale("second", 10));
    let m = await a.state(); expect(m.rewards).toHaveLength(1);
    const args = { organizationId: a.org.id, userId: a.staff.id, rewardId: m.rewards[0].id, branchId: null };
    const results = await Promise.allSettled([redeemReward(args), redeemReward(args)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const cancellation = await a.sale("first", 20, -100);
    await Promise.all([consumeLoyaltyEvent(cancellation), consumeLoyaltyEvent(cancellation)]);
    m = await a.state();
    expect(m.totalVisits).toBe(1); expect(m.deficitVisits).toBe(1);
    expect(m.rewards[0].status).toBe("REDEEMED"); expect(m.rewards[0].missingVisits).toBe(1);
    await consumeLoyaltyEvent(await a.sale("replacement", 30));
    m = await a.state(); expect(m.deficitVisits).toBe(0); expect(m.rewards).toHaveLength(1); expect(m.cycleVisits).toBe(0);
    await prisma.loyaltyMember.update({ where: { id: m.id }, data: { totalVisits: 999, totalSpent: 999 } });
    await reconcileLoyaltyMember(a.org.id, m.id, a.staff.id);
    expect((await a.state()).totalVisits).toBe(2);
    expect(Number((await a.state()).totalSpent)).toBe(200);
  });
  it("cancellation before completion never awards and works with module disabled", async () => {
    const b = await setup();
    const cancel = await b.sale("out-of-order", 20, -100); // original not received yet
    await consumeLoyaltyEvent(cancel);
    const event = await b.sale("out-of-order", 0);
    await consumeLoyaltyEvent(event);
    expect((await b.state()).totalVisits).toBe(0);
    await consumeLoyaltyEvent(await b.sale("enabled", 40));
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: b.org.id, module: "LOYALTY" } }, data: { status: "SUSPENDED" } });
    await consumeLoyaltyEvent(await b.sale("enabled", 50, -100));
    expect((await b.state()).totalVisits).toBe(0);
    await consumeLoyaltyEvent(await b.sale("disabled", 60));
    expect((await b.state()).totalVisits).toBe(0);
  });
  it("out-of-order positive events retain both visits and min/max dates", async () => {
    const b = await setup();
    await consumeLoyaltyEvent(await b.sale("later", 20));
    await consumeLoyaltyEvent(await b.sale("earlier", 0));
    const m = await b.state(); expect(m.totalVisits).toBe(2); expect(m.firstVisitAt).toEqual(b.at(0)); expect(m.lastVisitAt).toEqual(b.at(20));
  });
  it("unredeemed reward is voided even after later cycles and restored without a duplicate reward", async () => {
    const b = await setup();
    for (let n = 0; n < 4; n++) await consumeLoyaltyEvent(await b.sale(`cycle-${n}`, n * 10));
    await consumeLoyaltyEvent(await b.sale("cycle-0", 50, -100));
    let m = await b.state(); expect(m.rewards.map(r => r.status)).toEqual(["VOIDED", "AVAILABLE"]);
    await expect(redeemReward({ organizationId: b.org.id, userId: b.staff.id, rewardId: m.rewards[0].id, branchId: null })).rejects.toThrow();
    await consumeLoyaltyEvent(await b.sale("restore", 60));
    m = await b.state(); expect(m.rewards.map(r => r.status)).toEqual(["AVAILABLE", "AVAILABLE"]); expect(m.totalVisits).toBe(4);
  });
  it("no historical accrual, no cross-organization event or sale/member association", async () => {
    const b = await setup();
    const event = await b.sale("historical", -100);
    await consumeLoyaltyEvent(event); expect((await b.state()).totalVisits).toBe(0);
    await expect(consumeLoyaltyEvent({ ...event, organizationId: a.org.id })).rejects.toThrow("loyalty_sale_missing");
    await expect(registerVisit({ organizationId: a.org.id, memberId: a.member.id, employeeUserId: a.staff.id, branchId: null, saleAmount: 100, saleId: event.subjectId, idempotencyKey: "foreign-sale-id" })).rejects.toThrow();
    await expect(reconcileLoyaltyMember(a.org.id, b.member.id, a.staff.id)).rejects.toThrow();
  });
  it("outbox retries after worker failure without duplicating an already committed visit", async () => {
    const b = await setup();
    await b.sale("retry", 0);
    const fail = vi.fn().mockRejectedValue(new Error("worker unavailable"));
    const first = await processDomainEvents({ organizationId: b.org.id, now: b.at(100), consumers: [consumeLoyaltyEvent, fail] });
    expect(first.retried).toBeGreaterThan(0); expect((await b.state()).totalVisits).toBe(1);
    await processDomainEvents({ organizationId: b.org.id, now: b.at(200), consumers: [consumeLoyaltyEvent] });
    expect((await b.state()).totalVisits).toBe(1);
  });
  it("signed lookup is scoped, requires an active org/module, and never redeems", async () => {
    const b = await setup();
    const ask = (org: Org, body: unknown) => lookup(request("/api/webhooks/pos/loyalty", org, body));
    expect((await ask(b.org, { code: a.member.publicToken })).status).toBe(200);
    expect((await (await ask(b.org, { code: a.member.publicToken })).json()).status).toBe("not_enrolled");
    const found = await (await ask(a.org, { code: a.member.publicToken, redeemRewardId: "arbitrary" })).json();
    expect(found.status).toBe("found"); expect(found.member.maskedPhone).not.toBe(a.phone);
    const unsigned = new NextRequest("http://localhost/api/webhooks/pos/loyalty", { method: "POST", body: "{}" });
    expect((await lookup(unsigned)).status).toBe(401);
    await prisma.organization.update({ where: { id: b.org.id }, data: { isActive: false } });
    expect((await ask(b.org, { phone: b.phone })).status).toBe(401);
  });
  it("enrollment consent does not grant marketing consent; reward campaign supports dry-run", async () => {
    const b = await setup();
    await prisma.automation.create({ data: { organizationId: b.org.id, name: "Loyalty", type: "BLUEPRINT", webhookSecret: "test-only", status: "ACTIVE", trigger: "loyalty.reward_unlocked", blueprintKey: "loyalty_reward_unlocked", blueprintVersion: 1, dryRun: true, config: { quietStart: 0, quietEnd: 0 } } });
    await consumeLoyaltyEvent(await b.sale("r1", 0)); await consumeLoyaltyEvent(await b.sale("r2", 10));
    const event = await prisma.domainEvent.findFirstOrThrow({ where: { organizationId: b.org.id, type: "loyalty.reward_unlocked" } });
    await runAutomationsForEvent(event, b.at(15));
    const ex = await prisma.automationExecution.findFirstOrThrow({ where: { organizationId: b.org.id } });
    expect(ex.status).toBe("SKIPPED"); expect(ex.skipReason).toBe("no_consent");
    await prisma.customer.update({ where: { id: b.member.customerId! }, data: { consentAccepted: true } });
    await prisma.$transaction(tx => emitDomainEvent(tx, { organizationId: b.org.id, type: event.type, subjectType: event.subjectType, subjectId: event.subjectId, occurredAt: b.at(20), payload: { customerId: b.member.customerId, rewardName: "Café" }, dedupeKey: "simulation" }));
    const next = await prisma.domainEvent.findFirstOrThrow({ where: { organizationId: b.org.id, dedupeKey: "simulation" } });
    await runAutomationsForEvent(next, b.at(20));
    expect((await prisma.automationExecution.findFirstOrThrow({ where: { domainEventId: next.id } })).status).toBe("DRY_RUN");
  });
  it("duplicate order rows with new deliveries still reverse the original awarded visit", async () => {
    const b = await setup();
    const event = await b.sale("duplicate-order", 0);
    await consumeLoyaltyEvent(event);
    await b.sale("duplicate-order", 0); // legacy producer may store another sale row
    const duplicate = await prisma.foodSale.findFirstOrThrow({ where: { organizationId: b.org.id, externalOrderId: "duplicate-order" }, orderBy: { createdAt: "desc" } });
    await prisma.$transaction(tx => emitDomainEvent(tx, { organizationId: b.org.id, type: "sale.completed", subjectType: "sale", subjectId: duplicate.id, occurredAt: b.at(0), dedupeKey: "duplicate-business-operation" }));
    await consumeLoyaltyEvent(await prisma.domainEvent.findFirstOrThrow({ where: { organizationId: b.org.id, dedupeKey: "duplicate-business-operation" } }));
    expect((await b.state()).totalVisits).toBe(1);
    await consumeLoyaltyEvent(await b.sale("duplicate-order", 20, -100));
    expect((await b.state()).totalVisits).toBe(0);
  });
  it("partial return retains a visit, adjusts amount, and final full return voids it", async () => {
    const b = await setup();
    await consumeLoyaltyEvent(await b.sale("partial", 0));
    const partial = await b.sale("partial", 10, -40);
    await consumeLoyaltyEvent(partial); await consumeLoyaltyEvent(partial);
    expect((await b.state()).totalVisits).toBe(1); expect(Number((await b.state()).totalSpent)).toBe(60);
    await b.sale("partial", 20, -60);
    const final = await prisma.domainEvent.findFirstOrThrow({ where: { organizationId: b.org.id, dedupeKey: "sale.cancelled:partial:-60" } });
    await consumeLoyaltyEvent(final);
    expect((await b.state()).totalVisits).toBe(0); expect(Number((await b.state()).totalSpent)).toBe(0);
  });
  it("n8n outage cannot affect balances; delivery rechecks consent and cancelled rewards", async () => {
    const b = await setup();
    await prisma.customer.update({ where: { id: b.member.customerId! }, data: { consentAccepted: true } });
    await prisma.automation.create({ data: { organizationId: b.org.id, name: "Reward", type: "blueprint", webhookSecret: "test-only", status: "ACTIVE", trigger: "loyalty.reward_unlocked", blueprintKey: "loyalty_reward_unlocked", blueprintVersion: 1, dryRun: false, config: { quietStart: 0, quietEnd: 0 } } });
    await consumeLoyaltyEvent(await b.sale("notify-1", 0)); await consumeLoyaltyEvent(await b.sale("notify-2", 10));
    const event = await prisma.domainEvent.findFirstOrThrow({ where: { organizationId: b.org.id, type: "loyalty.reward_unlocked" } });
    await runAutomationsForEvent(event, b.at(20));
    vi.stubEnv("N8N_WEBHOOK_SECRET", "test-only"); vi.stubEnv("N8N_BASE_URL", "http://n8n.test");
    const fetchImpl = vi.fn().mockRejectedValue(new Error("n8n unavailable"));
    try {
      const result = await dispatchPendingExecutions({ organizationId: b.org.id, now: b.at(20), fetchImpl });
      expect(result.retried).toBe(1); expect((await b.state()).totalVisits).toBe(2);
      await prisma.customer.update({ where: { id: b.member.customerId! }, data: { consentAccepted: false } });
      fetchImpl.mockClear();
      await dispatchPendingExecutions({ organizationId: b.org.id, now: b.at(22), fetchImpl });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect((await prisma.automationExecution.findFirstOrThrow({ where: { organizationId: b.org.id } })).skipReason).toBe("no_consent");
      await prisma.customer.update({ where: { id: b.member.customerId! }, data: { consentAccepted: true } });
      await prisma.automationExecution.updateMany({ where: { organizationId: b.org.id }, data: { status: "PENDING" } });
      await consumeLoyaltyEvent(await b.sale("notify-1", 30, -100));
      await dispatchPendingExecutions({ organizationId: b.org.id, now: b.at(32), fetchImpl });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect((await prisma.automationExecution.findFirstOrThrow({ where: { organizationId: b.org.id } })).skipReason).toBe("reward_unavailable");
    } finally { vi.unstubAllEnvs(); }
  });
  it("purge and direct deletion cannot orphan a loyalty movement", async () => {
    const b = await setup();
    const event = await b.sale("keep-history", 0); await consumeLoyaltyEvent(event);
    const from = new Date(b.at(0).getTime() - 86_400_000).toISOString().slice(0, 10);
    const to = new Date(b.at(0).getTime() + 86_400_000).toISOString().slice(0, 10);
    await expect(purgePosSales(b.org.id, from, to)).rejects.toThrow(/historial de Lealtad/);
    await expect(prisma.foodSale.delete({ where: { id: event.subjectId } })).rejects.toThrow();
    expect((await b.state()).totalVisits).toBe(1);
  });

});

describe("POS customer recognition", () => {
  it("finds the customer by normalized phone, preserves consent and shows automatically earned rewards without a QR", async () => {
    const b = await setup();
    await prisma.customer.update({ where: { id: b.member.customerId! }, data: { consentAccepted: true, postalCode: "06400" } });
    const query = async () => {
      const response = await lookup(request("/api/webhooks/pos/loyalty", b.org, { action: "lookup", phone: "+52 81 5550 0001" }));
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      return response.json();
    };
    expect(await query()).toMatchObject({ status: "found", customer: { consentAccepted: true, postalCode: "06400" }, loyalty: { status: "found", member: { progress: { current: 0 } } } });
    await consumeLoyaltyEvent(await b.sale("phone-one", 0));
    await consumeLoyaltyEvent(await b.sale("phone-two", 10));
    const result = await query();
    expect(result.loyalty.member.rewardsAvailable).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(b.member.publicToken);
    expect(result.customer.consentAccepted).toBe(true);
    expect((await b.state()).visits.every(v => v.saleId !== null)).toBe(true);
  });
  it("persists a birthday captured at checkout and returns it on the next lookup without erasing omitted values", async () => {
    const b = await setup();
    const variant = await prisma.foodDishVariant.findFirstOrThrow({ where: { organizationId: b.org.id } });
    const sell = (orderId: string, customer: unknown) => orders(request("/api/webhooks/pos/orders", b.org, {
      orderId, occurredAt: new Date().toISOString(), grossAmount: 150, netAmount: 150 / 1.16, customer, items: [{ variantId: variant.id, quantity: 1 }],
    }));
    expect((await sell("birthday-first", { phone: b.phone, consent: { accepted: true }, birthday: { month: 2, day: 29 }, postalCode: "06400" })).status).toBe(200);
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: b.member.customerId! } })).toMatchObject({ birthDay: 29, birthMonth: 2, postalCode: "06400" });
    expect((await sell("birthday-next", { phone: b.phone })).status).toBe(200);
    const query = () => lookup(request("/api/webhooks/pos/loyalty", b.org, { action: "lookup", phone: b.phone }));
    expect(await (await query()).json()).toMatchObject({ status: "found", customer: { birthDay: 29, birthMonth: 2, postalCode: "06400", consentAccepted: true } });
    expect((await sell("birthday-revoked", { phone: b.phone, consent: { accepted: false }, birthday: { month: 5, day: 1 } })).status).toBe(200);
    expect(await (await query()).json()).toMatchObject({ customer: { birthDay: null, birthMonth: null, consentAccepted: false } });
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: b.member.customerId! } })).toMatchObject({ birthDay: 29, birthMonth: 2 });
  });
  it("isolates customers by organization and can identify a customer without Loyalty enabled", async () => {
    const b = await setup();
    await prisma.organizationModule.delete({ where: { organizationId_module: { organizationId: b.org.id, module: "LOYALTY" } } });
    const response = await lookup(request("/api/webhooks/pos/loyalty", b.org, { action: "lookup", phone: b.phone }));
    expect(await response.json()).toMatchObject({ status: "found", loyalty: { status: "module_disabled" } });
    const other = await createTestOrg("Customer lookup isolation"); orgs.push(other.id);
    await prisma.organizationModule.create({ data: { organizationId: other.id, module: "REYMEN_POS" } });
    expect(await (await lookup(request("/api/webhooks/pos/loyalty", other, { action: "lookup", phone: b.phone }))).json()).toEqual({ status: "not_found" });
    await prisma.organizationModule.delete({ where: { organizationId_module: { organizationId: other.id, module: "REYMEN_POS" } } });
    expect((await lookup(request("/api/webhooks/pos/loyalty", other, { action: "lookup", phone: b.phone }))).status).toBe(403);
  });
});
