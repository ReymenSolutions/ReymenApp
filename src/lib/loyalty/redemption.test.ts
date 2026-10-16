// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as posRewardsRoute } from "@/app/api/webhooks/pos/loyalty/route";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { saveProgram, enrollMember, registerVisit, redeemReward, chooseMemberProgram, getPublicCard } from "./service";
import { posRewards } from "./pos-rewards";
import { posRedemption, settlePosRedemption, rewardDiscountCents } from "./redemption";
import { emitDomainEvent } from "@/lib/domain-events";
import { consumeLoyaltyEvent } from "./events";
const orgs: string[] = [];
afterAll(async () => { for (const id of orgs) { await prisma.loyaltyPosRedemption.deleteMany({ where: { organizationId: id } }); await cleanupOrg(id); } });
async function setup() {
  const org = await createTestOrg("POS redemption"); orgs.push(org.id);
  await prisma.organizationModule.createMany({ data: (["LOYALTY", "REYMEN_POS"] as const).map(module => ({ organizationId: org.id, module })) });
  const user = await createTestUser(org.id, "OWNER", "redemption");
  const input = { name: "Club", description: null, status: "ACTIVE" as const, visitGoal: 2, rewardType: "DISCOUNT_AMOUNT" as const, rewardValue: 50, rewardName: "$50 de regalo", rewardDescription: null, rewardHeadline: null, scope: "ORGANIZATION" as const, branchId: null };
  const program = await saveProgram(org.id, user.id, input);
  const enrolled = await enrollMember(org.slug, { name: "Cliente", whatsapp: "8155512345", postalCode: "64000", email: null, branchId: null, consent: true });
  if (enrolled.status !== "created") throw new Error("enroll");
  const member = await prisma.loyaltyMember.findUniqueOrThrow({ where: { publicToken: enrolled.token } });
  const now = Date.now() + 60000;
  for (const n of [0, 1]) await registerVisit({ organizationId: org.id, employeeUserId: user.id, memberId: member.id, branchId: null, saleAmount: 100, idempotencyKey: `earn-reward-${n}`, now: new Date(now + n * 600000) });
  const reward = await prisma.loyaltyReward.findFirstOrThrow({ where: { memberId: member.id } });
  return { org, user, member, reward, program, input };
}
describe("POS reward reservation", () => {
  it("calculates fixed and percentage discounts, including a fully paid reward", () => {
    expect(rewardDiscountCents("DISCOUNT_AMOUNT", 150, 10000)).toBe(10000);
    expect(rewardDiscountCents("DISCOUNT_PERCENT", 12.5, 10000)).toBe(1250);
    expect(rewardDiscountCents("DISCOUNT_PERCENT", 101, 10000)).toBe(0);
    expect(rewardDiscountCents("FREE_ITEM", 1, 10000)).toBe(0);
  });
  it("reserves once across boxes, rejects manual double redemption, commits and restores after cancellation", async () => {
    const a = await setup();
    const request = { action: "reserve" as const, orderId: randomUUID(), deviceId: "box-a", phone: a.member.whatsapp, subtotalCents: 15000, rewardId: a.reward.id };
    const other = { ...request, orderId: randomUUID(), deviceId: "box-b" };
    const attempts = await Promise.all([posRedemption(a.org.id, request), posRedemption(a.org.id, other)]);
    expect(attempts.filter(r => r.status === "reserved")).toHaveLength(1);
    const winner = attempts[0].status === "reserved" ? request : other;
    expect((await posRedemption(a.org.id, winner)).status).toBe("reserved");
    await expect(posRedemption(a.org.id, { ...winner, subtotalCents: 10000 })).rejects.toThrow();
    await expect(redeemReward({ organizationId: a.org.id, userId: a.user.id, rewardId: a.reward.id, branchId: null })).rejects.toThrow();
    const sale = await prisma.foodSale.create({ data: { organizationId: a.org.id, channel: "POS", occurredAt: new Date(), customerId: a.member.customerId, grossAmount: 100, netAmount: 86.21, discountAmount: 50, externalOrderId: winner.orderId } });
    await prisma.$transaction(tx => settlePosRedemption(tx, sale, false, "event-1"));
    await prisma.$transaction(tx => settlePosRedemption(tx, sale, false, "event-1"));
    expect((await prisma.loyaltyReward.findUniqueOrThrow({ where: { id: a.reward.id } })).status).toBe("REDEEMED");
    await prisma.$transaction(tx => settlePosRedemption(tx, sale, true, "cancel-1"));
    await prisma.$transaction(tx => settlePosRedemption(tx, sale, true, "cancel-1"));
    expect((await prisma.loyaltyReward.findUniqueOrThrow({ where: { id: a.reward.id } })).status).toBe("AVAILABLE");
    expect((await posRedemption(a.org.id, { ...request, orderId: randomUUID() })).status).toBe("reserved");
  });
  it("restores a fully discounted zero-total sale exactly once through domain events", async () => {
    const a = await setup();
    const orderId = randomUUID();
    await posRedemption(a.org.id, { action: "reserve", orderId, deviceId: "box", phone: a.member.whatsapp, subtotalCents: 5000, rewardId: a.reward.id });
    const occurredAt = new Date();
    const sale = await prisma.foodSale.create({ data: { organizationId: a.org.id, channel: "POS", occurredAt, customerId: a.member.customerId, grossAmount: 0, netAmount: 0, discountAmount: 50, externalOrderId: orderId } });
    async function consume(type: "sale.completed" | "sale.cancelled", id: string, key: string) {
      await prisma.$transaction(tx => emitDomainEvent(tx, { organizationId: a.org.id, type, subjectType: "sale", subjectId: id, occurredAt, payload: {}, dedupeKey: key }));
      await consumeLoyaltyEvent(await prisma.domainEvent.findFirstOrThrow({ where: { organizationId: a.org.id, dedupeKey: key } }));
    }
    await consume("sale.completed", sale.id, "zero-sale");
    expect((await prisma.loyaltyReward.findUniqueOrThrow({ where: { id: a.reward.id } })).status).toBe("REDEEMED");
    const cancel = await prisma.foodSale.create({ data: { organizationId: a.org.id, channel: "POS", occurredAt, customerId: a.member.customerId, grossAmount: 0, netAmount: 0, externalOrderId: orderId, cancelsSaleId: sale.id, isCancellation: true } });
    await consume("sale.cancelled", cancel.id, "zero-cancel");
    await consume("sale.cancelled", cancel.id, "zero-cancel-retry");
    expect((await prisma.loyaltyReward.findUniqueOrThrow({ where: { id: a.reward.id } })).status).toBe("AVAILABLE");
    expect(await prisma.loyaltyPosRedemption.count({ where: { organizationId: a.org.id, status: "CANCELLED" } })).toBe(1);
  });
  it("isolates organizations and releases abandoned reservations idempotently", async () => {
    const a = await setup(), b = await setup();
    const input = { action: "reserve" as const, orderId: randomUUID(), deviceId: "box", phone: a.member.whatsapp, subtotalCents: 10000, rewardId: a.reward.id };
    expect((await posRedemption(b.org.id, input)).status).toBe("no_reward");
    expect((await posRedemption(a.org.id, input)).status).toBe("reserved");
    await expect(posRedemption(a.org.id, { ...input, action: "release", deviceId: "another" })).rejects.toThrow();
    expect((await posRedemption(a.org.id, { ...input, action: "release" })).status).toBe("released");
    expect((await posRedemption(a.org.id, { ...input, action: "release" })).status).toBe("released");
    await expect(posRedemption(a.org.id, input)).rejects.toThrow();
  });
  it("each member chooses a program without transferring earlier progress or rewards", async () => {
    const a = await setup();
    const second = await saveProgram(a.org.id, a.user.id, { ...a.input, createNew: true, name: "Segundo", visitGoal: 3 });
    const choice = await chooseMemberProgram(a.org.slug, a.member.publicToken, second.programId);
    const selected = await prisma.loyaltyMember.findUniqueOrThrow({ where: { publicToken: choice.token } });
    expect(selected.programId).toBe(second.programId);
    expect(selected.totalVisits).toBe(0);
    expect(await prisma.loyaltyMember.count({ where: { organizationId: a.org.id, customerId: a.member.customerId, isSelected: true } })).toBe(1);
    expect((await getPublicCard(a.org.slug, a.member.publicToken))?.program.id).toBe(a.program.programId);
    await registerVisit({ organizationId: a.org.id, employeeUserId: a.user.id, memberId: a.member.id, branchId: null, saleAmount: 150, idempotencyKey: "chosen-program-visit", now: new Date(Date.now() + 2000000) });
    expect((await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: selected.id } })).totalVisits).toBe(1);
    expect((await prisma.loyaltyMember.findUniqueOrThrow({ where: { id: a.member.id } })).totalVisits).toBe(2);
    expect((await chooseMemberProgram(a.org.slug, choice.token, a.program.programId)).token).toBe(a.member.publicToken);
    await expect(chooseMemberProgram(a.org.slug, "wrong-token", second.programId)).rejects.toThrow();
  });
  it("an outbox sale retains the program selected at ingestion after the member switches", async () => {
    const a = await setup();
    const second = await saveProgram(a.org.id, a.user.id, { ...a.input, createNew: true, name: "Otro" });
    const occurredAt = new Date(Date.now() + 3000000);
    const sale = await prisma.foodSale.create({ data: { organizationId: a.org.id, channel: "POS", occurredAt, customerId: a.member.customerId, grossAmount: 100, netAmount: 100, externalOrderId: randomUUID() } });
    await prisma.$transaction(tx => emitDomainEvent(tx, { organizationId: a.org.id, type: "sale.completed", subjectType: "sale", subjectId: sale.id, occurredAt, payload: { loyaltyMemberId: a.member.id }, dedupeKey: "selection-sale" }));
    await chooseMemberProgram(a.org.slug, a.member.publicToken, second.programId);
    await consumeLoyaltyEvent(await prisma.domainEvent.findFirstOrThrow({ where: { organizationId: a.org.id, dedupeKey: "selection-sale" } }));
    expect((await prisma.loyaltyVisit.findFirstOrThrow({ where: { saleId: sale.id } })).memberId).toBe(a.member.id);
  });
});

describe("manual rewards from POS", () => {
  it("lists separate free Lattes, redeems once across retries and keeps the other reward available", async () => {
    const a = await setup();
    await prisma.loyaltyReward.update({ where: { id: a.reward.id }, data: { rewardType: "FREE_ITEM", rewardValue: null, rewardName: "Latte gratis" } });
    const second = await prisma.loyaltyReward.create({ data: { organizationId: a.org.id, memberId: a.member.id, programId: a.member.programId, programVersion: 1, visitGoal: 2, cycleNumber: 2, rewardName: "Latte gratis", rewardType: "FREE_ITEM", status: "AVAILABLE" } });
    const base = { deviceId: "box", phone: a.member.whatsapp, branchId: null };
    const before = await posRewards(a.org.id, { ...base, action: "rewards.list" });
    expect(before.rewards).toHaveLength(2);
    expect(before.rewards?.every(r => r.kind === "manual")).toBe(true);
    const request = { ...base, action: "reward.redeem" as const, rewardId: a.reward.id, requestId: randomUUID(), employeeId: "cashier", actorRole: "cashier" as const };
    const both = await Promise.all([posRewards(a.org.id, request), posRewards(a.org.id, request)]);
    expect(both.every(r => r.status === "redeemed")).toBe(true);
    expect(await prisma.auditLog.count({ where: { organizationId: a.org.id, action: "loyalty.reward_redeem", resourceId: a.reward.id } })).toBe(1);
    expect((await posRewards(a.org.id, { ...base, action: "rewards.list" })).rewards?.map(r => r.id)).toEqual([second.id]);
    await expect(posRewards(a.org.id, { ...request, requestId: randomUUID() })).rejects.toThrow();
    await expect(redeemReward({ organizationId: a.org.id, userId: a.user.id, rewardId: a.reward.id, branchId: null })).rejects.toThrow();
  });
  it("requires cashier proof and correct customer, keeps discounts on the sale-reservation path", async () => {
    const a = await setup();
    const base = { action: "reward.redeem" as const, deviceId: "box", phone: a.member.whatsapp, rewardId: a.reward.id, requestId: randomUUID() };
    await expect(posRewards(a.org.id, base)).rejects.toThrow(/PIN/);
    await expect(posRewards(a.org.id, { ...base, employeeId: "cashier", actorRole: "cashier" })).rejects.toThrow(/descuento/);
    const c = await prisma.customer.create({ data: { organizationId: a.org.id, phone: "+528155512346", phoneKey: "8155512346" } });
    await expect(posRewards(a.org.id, { ...base, phone: c.phone, employeeId: "cashier", actorRole: "cashier" })).rejects.toThrow(/encontrada/);
    expect((await posRewards(a.org.id, { action: "rewards.list", deviceId: "box", phone: c.phone })).rewards).toEqual([]);
    const b = await setup();
    await expect(posRewards(b.org.id, { ...base, employeeId: "cashier", actorRole: "cashier", phone: b.member.whatsapp })).rejects.toThrow();
    expect((await prisma.loyaltyReward.findUniqueOrThrow({ where: { id: a.reward.id } })).status).toBe("AVAILABLE");
  });
  it("uses each earned reward name, preserving pending Lattes when the program changes to Matcha", async () => {
    const a = await setup();
    await prisma.loyaltyReward.update({ where: { id: a.reward.id }, data: { rewardType: "FREE_ITEM", rewardValue: null, rewardName: "Latte gratis" } });
    await saveProgram(a.org.id, a.user.id, { ...a.input, programId: a.member.programId, rewardType: "FREE_ITEM", rewardValue: null, rewardName: "Matcha gratis" });
    for (const n of [0, 1]) await registerVisit({ organizationId: a.org.id, employeeUserId: a.user.id, memberId: a.member.id, branchId: null, saleAmount: 100, idempotencyKey: `matcha-${n}`, now: new Date(Date.now() + 1800000 + n * 600000) });
    const result = await posRewards(a.org.id, { action: "rewards.list", phone: a.member.whatsapp, deviceId: "box" });
    expect(result.rewards?.map(r => r.name)).toEqual(["Latte gratis", "Matcha gratis"]);
    expect(result.rewards?.every(r => r.kind === "manual")).toBe(true);
  });
  it("authenticates the endpoint, requires active modules and binds a gift to its program branch", async () => {
    const a = await setup();
    const branch = await prisma.branch.create({ data: { organizationId: a.org.id, name: "Centro" } });
    await prisma.loyaltyProgram.update({ where: { id: a.member.programId }, data: { scope: "BRANCH", branchId: branch.id } });
    await prisma.loyaltyReward.update({ where: { id: a.reward.id }, data: { rewardType: "FREE_ITEM", rewardValue: null } });
    const call = (body: object, signed = true) => {
      const raw = JSON.stringify(body), timestamp = String(Date.now());
      return posRewardsRoute(new NextRequest("http://localhost/api/webhooks/pos/loyalty", { method: "POST", body: raw, headers: { "x-reymen-orgid": a.org.id, "x-reymen-timestamp": timestamp, "x-reymen-signature": signed ? createWebhookSignature(raw, a.org.n8nWebhookSecret, timestamp) : "invalid" } }));
    };
    const list = { action: "rewards.list", phone: a.member.whatsapp, deviceId: "box" };
    expect((await call(list, false)).status).toBe(401);
    expect((await (await call(list)).json()).rewards).toEqual([]);
    expect((await (await call({ ...list, branchId: branch.id })).json()).rewards).toHaveLength(1);
    const redeem = { action: "reward.redeem", phone: a.member.whatsapp, deviceId: "box", rewardId: a.reward.id, employeeId: "cashier", actorRole: "cashier", requestId: randomUUID() };
    expect((await call(redeem)).status).toBe(409);
    expect((await call({ ...redeem, actorRole: "waiter", branchId: branch.id })).status).toBe(400);
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: a.org.id, module: "LOYALTY" } }, data: { status: "SUSPENDED" } });
    expect((await call({ ...redeem, branchId: branch.id })).status).toBe(403);
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: a.org.id, module: "LOYALTY" } }, data: { status: "ACTIVE" } });
    expect((await call({ ...redeem, branchId: branch.id })).status).toBe(200);
  });
  it("serializes simultaneous gift redemption from App and POS", async () => {
    const a = await setup();
    await prisma.loyaltyReward.update({ where: { id: a.reward.id }, data: { rewardType: "FREE_ITEM", rewardValue: null } });
    const results = await Promise.allSettled([
      posRewards(a.org.id, { action: "reward.redeem", phone: a.member.whatsapp, deviceId: "box", rewardId: a.reward.id, requestId: randomUUID(), employeeId: "cashier", actorRole: "cashier" }),
      redeemReward({ organizationId: a.org.id, userId: a.user.id, rewardId: a.reward.id, branchId: null }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { organizationId: a.org.id, action: "loyalty.reward_redeem", resourceId: a.reward.id } })).toBe(1);
  });
  it("allows explicitly selecting a later discount without consuming the older reward", async () => {
    const a = await setup();
    const reward = await prisma.loyaltyReward.create({ data: { organizationId: a.org.id, memberId: a.member.id, programId: a.member.programId, programVersion: 1, visitGoal: 2, cycleNumber: 2, rewardName: "$20", rewardType: "DISCOUNT_AMOUNT", rewardValue: 20, status: "AVAILABLE", earnedAt: new Date(Date.now() + 10000000) } });
    const base = { action: "quote" as const, deviceId: "box", phone: a.member.whatsapp, subtotalCents: 10000, orderId: randomUUID() };
    expect(await posRedemption(a.org.id, base)).toMatchObject({ rewardId: a.reward.id });
    expect(await posRedemption(a.org.id, { ...base, rewardId: reward.id })).toMatchObject({ rewardId: reward.id, amountCents: 2000 });
    expect((await prisma.loyaltyReward.findUniqueOrThrow({ where: { id: a.reward.id } })).status).toBe("AVAILABLE");
  });
});
