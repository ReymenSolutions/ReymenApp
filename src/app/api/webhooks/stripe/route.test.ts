// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_dummy");
vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_pro_123");
vi.stubEnv("STRIPE_PRICE_BUSINESS", "price_ent_456");

const constructEvent = vi.fn();
const subscriptionsRetrieve = vi.fn();

vi.mock("stripe", () => ({
  default: class MockStripe {
    webhooks = { constructEvent };
    subscriptions = { retrieve: subscriptionsRetrieve };
  },
}));

// El límite de integrantes de SmartCard se iguala al plan en cada cambio.
const syncSmartcard = vi.fn(async () => "updated");
vi.mock("@/lib/smartcard-link", () => ({ syncSmartcardMemberLimitForPlan: syncSmartcard }));

const { POST } = await import("./route");

function makeRequest(body: string): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "test-sig" },
    body,
  });
}

function fakeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    status: "active",
    customer: "cus_123",
    items: { data: [{ price: { id: "price_pro_123" } }] },
    ...overrides,
  };
}

describe("POST /api/webhooks/stripe", () => {
  let org: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Stripe Webhook Org");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  beforeEach(() => {
    constructEvent.mockReset();
    subscriptionsRetrieve.mockReset();
    syncSmartcard.mockClear();
  });

  it("rejects a request with an invalid signature", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(400);
  });

  it("checkout.session.completed activates the subscribed plan on the org", async () => {
    subscriptionsRetrieve.mockResolvedValue(fakeSubscription());
    constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { organizationId: org.id, plan: "professional" },
          subscription: "sub_123",
        },
      },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(updated.plan).toBe("professional");
    expect(updated.stripeSubscriptionId).toBe("sub_123");
    expect(updated.stripeSubscriptionStatus).toBe("active");
    expect(syncSmartcard).toHaveBeenCalledWith(org.id, "professional");

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: org.id, action: "billing.plan_change" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
  });

  it("customer.subscription.updated re-syncs the plan from the new price", async () => {
    await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: "cus_123" } });
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: fakeSubscription({ items: { data: [{ price: { id: "price_ent_456" } }] } }) },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(updated.plan).toBe("business");
    expect(syncSmartcard).toHaveBeenCalledWith(org.id, "business");
  });

  it("customer.subscription.deleted reverts the org to the starter plan", async () => {
    constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: fakeSubscription() },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(updated.plan).toBe("starter");
    expect(updated.stripeSubscriptionId).toBeNull();
    expect(updated.stripeSubscriptionStatus).toBe("canceled");
    expect(syncSmartcard).toHaveBeenCalledWith(org.id, "starter");
  });

  it("ignores an event for a customer with no matching organization, without erroring", async () => {
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: fakeSubscription({ customer: "cus_does_not_exist" }) },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
  });

  it("invoice.paid recorre el vencimiento una sola vez por factura y subscription.updated fija el fin de periodo", async () => {
    await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: "cus_123", billingPeriodEnd: null } });
    const end = Math.floor(Date.now() / 1000) + 30 * 86400;
    constructEvent.mockReturnValue({ type: "invoice.paid", data: { object: { id: "in_test_1", customer: "cus_123", amount_paid: 129900, lines: { data: [{ period: { end } }] } } } });
    expect((await POST(makeRequest("{}"))).status).toBe(200);
    expect((await POST(makeRequest("{}"))).status).toBe(200); // reintento del webhook
    expect(await prisma.billingPayment.count({ where: { organizationId: org.id, externalRef: "in_test_1" } })).toBe(1);
    const paid = await prisma.billingPayment.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(Number(paid.amountMxn)).toBe(1299);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).billingPeriodEnd?.getTime()).toBe(end * 1000);

    const later = end + 30 * 86400;
    constructEvent.mockReturnValue({ type: "customer.subscription.updated", data: { object: fakeSubscription({ items: { data: [{ price: { id: "price_pro_123" }, current_period_end: later }] } }) } });
    await POST(makeRequest("{}"));
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).billingPeriodEnd?.getTime()).toBe(later * 1000);
  });
});
