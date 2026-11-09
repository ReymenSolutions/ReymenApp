// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "./prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
const product = vi.fn().mockResolvedValue({ id: "prod_contract" });
const price = vi.fn(async (input: { unit_amount: number; metadata: { organizationId: string } }) => ({ id: `price_${input.metadata.organizationId}_${input.unit_amount}` }));
const retrieve = vi.fn();
const update = vi.fn().mockResolvedValue({});
vi.mock("./stripe", () => ({ getStripeClient: () => ({ products: { create: product }, prices: { create: price, retrieve: vi.fn().mockResolvedValue({ active: true, currency: "mxn", unit_amount: 123456, recurring: { interval: "month", interval_count: 1 } }) }, subscriptions: { retrieve, update } }) }));
const { customContractPrice, syncCustomSubscription, reconcileCustomSubscriptions } = await import("./stripe-contracts");
describe("custom subscription agreements", () => {
  let org: { id: string };
  beforeAll(async () => { org = await createTestOrg("Custom contract"); });
  afterAll(async () => { await cleanupOrg(org.id); });
  it("creates an immutable monthly MXN price from the saved amount, scoped to the organization", async () => {
    const id = await customContractPrice(org.id, 123456);
    expect(await customContractPrice(org.id, 123456)).toBe(id);
    expect(price).toHaveBeenCalledTimes(1);
    expect(price).toHaveBeenCalledWith(expect.objectContaining({ unit_amount: 123456, currency: "mxn", recurring: { interval: "month" }, metadata: { organizationId: org.id } }), expect.objectContaining({ idempotencyKey: `custom-price:${org.id}:123456` }));
    await expect(customContractPrice(org.id, -1)).rejects.toThrow();
  });
  it("changes the next renewal without proration or resetting the billing date; detects a different customer", async () => {
    await prisma.organization.update({ where: { id: org.id }, data: { customPlan: true, customMonthlyPriceMxn: 1234.56, stripeCustomerId: "cus_contract", stripeSubscriptionId: "sub_contract", stripeSubscriptionStatus: "active" } });
    retrieve.mockResolvedValue({ id: "sub_contract", customer: "cus_other", items: { data: [] } });
    await expect(syncCustomSubscription(org.id)).rejects.toThrow(/manual review/);
    expect(update).not.toHaveBeenCalled();
    retrieve.mockResolvedValue({ id: "sub_contract", customer: "cus_contract", schedule: null, items: { data: [{ id: "si_contract", quantity: 1, price: { id: "price_old", currency: "mxn", recurring: { interval: "month", interval_count: 1 } } }] } });
    expect(await syncCustomSubscription(org.id)).toBe("synced");
    expect(update).toHaveBeenCalledWith("sub_contract", { items: [{ id: "si_contract", price: `price_${org.id}_123456`, quantity: 1 }], proration_behavior: "none", billing_cycle_anchor: "unchanged" }, { timeout: 8000, maxNetworkRetries: 0 });
  });
  it("retains desired state after an uncertain network error and reconciles without duplicating charges", async () => {
    update.mockRejectedValueOnce(new Error("network timeout"));
    expect((await reconcileCustomSubscriptions()).pending).toBeGreaterThanOrEqual(1);
    expect(Number((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).customMonthlyPriceMxn)).toBe(1234.56);
    retrieve.mockResolvedValue({ id: "sub_contract", customer: "cus_contract", schedule: null, items: { data: [{ id: "si_contract", price: { id: `price_${org.id}_123456` } }] } });
    update.mockClear();
    expect(await syncCustomSubscription(org.id)).toBe("synced");
    expect(update).not.toHaveBeenCalled();
  });
});
