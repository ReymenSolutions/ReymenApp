// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_pro_123");
vi.stubEnv("STRIPE_PRICE_BUSINESS", "price_ent_456");

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const pricesRetrieve = vi.fn(async (id: string) => ({ active: true, currency: "mxn", recurring: { interval: "month", interval_count: 1 }, unit_amount: id === "price_ent_456" ? 399900 : 199900 }));
const customersCreate = vi.fn().mockResolvedValue({ id: "cus_new_123" });
const checkoutSessionsCreate = vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/pay/cs_test_123" });
const billingPortalSessionsCreate = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/p/session_123" });

vi.mock("stripe", () => ({
  default: class MockStripe {
    customers = { create: customersCreate };
    products = { create: vi.fn().mockResolvedValue({ id: "prod_custom" }) };
    prices = { retrieve: pricesRetrieve, create: vi.fn().mockResolvedValue({ id: "price_custom" }) };
    checkout = { sessions: { create: checkoutSessionsCreate } };
    billingPortal = { sessions: { create: billingPortalSessionsCreate } };
  },
}));

const { createCheckoutSession, createBillingPortalSession, getBillingInfo } = await import("./billing");

describe("billing actions", () => {
  let org: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Billing Test Org");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  beforeEach(() => {
    customersCreate.mockClear();
    checkoutSessionsCreate.mockClear();
    billingPortalSessionsCreate.mockClear();
  });

  it("denies checkout to a role without settings:manage", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "AGENT", organizationId: org.id }));
    await expect(createCheckoutSession("professional")).rejects.toThrow(/permisos/i);
  });

  it("creates a Stripe customer on first checkout and reuses it on the next", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));

    const result = await createCheckoutSession("professional");
    expect(result.url).toContain("checkout.stripe.com");
    expect(customersCreate).toHaveBeenCalledTimes(1);
    expect(checkoutSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_new_123", mode: "subscription" })
    );

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(updated.stripeCustomerId).toBe("cus_new_123");

    // Second call must not create a second Stripe customer.
    await createCheckoutSession("professional");
    expect(customersCreate).toHaveBeenCalledTimes(1);
    expect(checkoutSessionsCreate).toHaveBeenCalledTimes(2);
  });

  it("refuses selecting a different plan over an agreed custom price", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));
    await prisma.organization.update({ where: { id: org.id }, data: { customMonthlyPriceMxn: 99 } });
    try { await expect(createCheckoutSession("business")).rejects.toThrow(/personalizado vigente/); }
    finally { await prisma.organization.update({ where: { id: org.id }, data: { customMonthlyPriceMxn: null } }); }
  });

  it("checks out the saved custom amount instead of the catalog price", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "professional", customPlan: true, customMonthlyPriceMxn: 750.50 } });
    pricesRetrieve.mockResolvedValueOnce({ active: true, currency: "mxn", recurring: { interval: "month", interval_count: 1 }, unit_amount: 75050 });
    try {
      await createCheckoutSession("professional");
      expect(checkoutSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: "price_custom", quantity: 1 }], subscription_data: { metadata: { organizationId: org.id } } }));
    } finally { await prisma.organization.update({ where: { id: org.id }, data: { customPlan: false, customMonthlyPriceMxn: null } }); }
  });

  it("offers other active catalog plans and rejects wrong Stripe amounts before checkout", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));
    await expect(createCheckoutSession("business")).resolves.toHaveProperty("url");
    checkoutSessionsCreate.mockClear();
    pricesRetrieve.mockResolvedValueOnce({ active: true, currency: "usd", recurring: { interval: "month", interval_count: 1 }, unit_amount: 199900 });
    await expect(createCheckoutSession("professional")).rejects.toThrow(/no coincide/);
    expect(checkoutSessionsCreate).not.toHaveBeenCalled();
    await expect(createCheckoutSession("unknown")).rejects.toThrow(/no disponible/);
  });

  it("opens the billing portal only once a Stripe customer exists", async () => {
    const freshOrg = await createTestOrg("Billing Portal Org");
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: freshOrg.id }));
    await expect(createBillingPortalSession()).rejects.toThrow(/no tiene una suscripción/i);

    await prisma.organization.update({ where: { id: freshOrg.id }, data: { stripeCustomerId: "cus_existing" } });
    const result = await createBillingPortalSession();
    expect(result.url).toContain("billing.stripe.com");
    expect(billingPortalSessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ customer: "cus_existing" })
    );

    await cleanupOrg(freshOrg.id);
  });

  it("getBillingInfo reflects the org's current plan and subscription status", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));
    await prisma.organization.update({
      where: { id: org.id },
      data: { plan: "professional", stripeSubscriptionStatus: "active" },
    });

    const info = await getBillingInfo();
    expect(info.stripeEnabled).toBe(true);
    expect(info.plan).toBe("professional");
    expect(info.hasActiveSubscription).toBe(true);
  });
});
