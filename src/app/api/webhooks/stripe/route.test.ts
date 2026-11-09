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

// Stripe incluye `created` en cada evento; cada evento de prueba es más nuevo que el anterior (como en la vida real).
let createdCounter = Math.floor(Date.now() / 1000);
const nextCreated = () => ++createdCounter;

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
    await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: "cus_123" } });
    subscriptionsRetrieve.mockResolvedValue(fakeSubscription());
    constructEvent.mockReturnValue({
      created: nextCreated(),
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { organizationId: org.id, plan: "professional" },
          subscription: "sub_123",
          customer: "cus_123",
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
      created: nextCreated(),
      type: "customer.subscription.updated",
      data: { object: fakeSubscription({ items: { data: [{ price: { id: "price_ent_456" } }] } }) },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(updated.plan).toBe("business");
    expect(syncSmartcard).toHaveBeenCalledWith(org.id, "business");
  });

  it("customer.subscription.deleted preserves the purchased plan until paid access expires", async () => {
    constructEvent.mockReturnValue({
      created: nextCreated(),
      type: "customer.subscription.deleted",
      data: { object: fakeSubscription() },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);

    const updated = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(updated.plan).toBe("business");
    expect(updated.stripeSubscriptionId).toBeNull();
    expect(updated.stripeSubscriptionStatus).toBe("canceled");
    expect(syncSmartcard).not.toHaveBeenCalled();
  });

  it("ignores an event for a customer with no matching organization, without erroring", async () => {
    constructEvent.mockReturnValue({
      created: nextCreated(),
      type: "customer.subscription.updated",
      data: { object: fakeSubscription({ customer: "cus_does_not_exist" }) },
    });

    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(200);
  });

  it("invoice.paid recorre el vencimiento una sola vez por factura y subscription.updated no concede un periodo sin pago", async () => {
    await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: "cus_123", stripeSubscriptionId: "sub_123", billingPeriodEnd: null } });
    subscriptionsRetrieve.mockResolvedValue(fakeSubscription());
    const end = Math.floor(Date.now() / 1000) + 30 * 86400;
    constructEvent.mockReturnValue({ created: nextCreated(), type: "invoice.paid", data: { object: { id: "in_test_1", currency: "mxn", customer: "cus_123", amount_paid: 129900, parent: { subscription_details: { subscription: "sub_123" } }, lines: { data: [{ parent: { subscription_item_details: { subscription: "sub_123", proration: false } }, period: { end } }] } } } });
    expect((await POST(makeRequest("{}"))).status).toBe(200);
    expect((await POST(makeRequest("{}"))).status).toBe(200); // reintento del webhook
    expect(await prisma.billingPayment.count({ where: { organizationId: org.id, externalRef: "in_test_1" } })).toBe(1);
    const paid = await prisma.billingPayment.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(Number(paid.amountMxn)).toBe(1299);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).billingPeriodEnd?.getTime()).toBe(end * 1000);

    const later = end + 30 * 86400;
    constructEvent.mockReturnValue({ created: nextCreated(), type: "customer.subscription.updated", data: { object: fakeSubscription({ items: { data: [{ price: { id: "price_pro_123" }, current_period_end: later }] } }) } });
    await POST(makeRequest("{}"));
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).billingPeriodEnd?.getTime()).toBe(end * 1000);
  });

  it("a renewal payment does not reactivate manually suspended modules", async () => {
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "professional", stripeSubscriptionId: "sub_123", stripeCustomerId: "cus_123" } });
    await prisma.organizationModule.updateMany({ where: { organizationId: org.id, module: "CRM" }, data: { status: "SUSPENDED", source: "SUBSCRIBED" } });
    subscriptionsRetrieve.mockResolvedValue(fakeSubscription());
    const end = Math.floor(Date.now() / 1000) + 60 * 86400;
    constructEvent.mockReturnValue({ created: nextCreated(), type: "invoice.paid", data: { object: { id: "in_no_override", currency: "mxn", customer: "cus_123", amount_paid: 50000, parent: { subscription_details: { subscription: "sub_123" } }, lines: { data: [{ parent: { subscription_item_details: { subscription: "sub_123", proration: false } }, period: { end } }] } } } });
    expect((await POST(makeRequest("{}"))).status).toBe(200);
    expect(await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId: org.id, module: "CRM" } } })).toMatchObject({ status: "SUSPENDED" });
  });

  it("implementation invoices do not extend the subscription period", async () => {
    const before = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    constructEvent.mockReturnValue({ created: nextCreated(), type: "invoice.paid", data: { object: { id: "in_setup", currency: "mxn", customer: "cus_123", amount_paid: 500000, parent: null, lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 365 * 86400 } }] } } } });
    expect((await POST(makeRequest("{}"))).status).toBe(200);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).billingPeriodEnd).toEqual(before.billingPeriodEnd);
    expect(await prisma.billingPayment.count({ where: { organizationId: org.id, externalRef: "in_setup" } })).toBe(0);
  });

  it("accepts a custom price only for its owning organization and preserves the agreement", async () => {
    const custom = await createTestOrg("Custom price owner");
    try {
      await prisma.organization.update({ where: { id: custom.id }, data: { customPlan: true, customMonthlyPriceMxn: 777, stripeCustomerId: "cus_price_owner" } });
      await prisma.stripeContractPrice.create({ data: { organizationId: custom.id, amountCents: 77700, stripePriceId: "price_owned_custom" } });
      const sub = fakeSubscription({ id: "sub_price_owner", customer: "cus_price_owner", items: { data: [{ price: { id: "price_owned_custom" } }] } });
      constructEvent.mockReturnValue({ created: nextCreated(), type: "customer.subscription.updated", data: { object: sub } });
      expect((await POST(makeRequest("{}"))).status).toBe(200);
      expect(Number((await prisma.organization.findUniqueOrThrow({ where: { id: custom.id } })).customMonthlyPriceMxn)).toBe(777);
      constructEvent.mockReturnValue({ created: nextCreated(), type: "customer.subscription.updated", data: { object: { ...sub, customer: "cus_123" } } });
      expect((await POST(makeRequest("{}"))).status).toBe(500);
    } finally { await cleanupOrg(custom.id); }
  });

  it("AUD-010: un evento atrasado no restaura un plan anterior sobre uno más reciente", async () => {
    await prisma.organization.update({ where: { id: org.id }, data: { stripeCustomerId: "cus_123", plan: "starter", stripeEventAt: null, stripeSubscriptionId: null } });
    const newer = nextCreated();
    const older = newer - 100;
    // Llega primero el evento nuevo (Business) y luego, atrasado, uno viejo (Professional).
    constructEvent.mockReturnValue({ created: newer, type: "customer.subscription.updated", data: { object: fakeSubscription({ items: { data: [{ price: { id: "price_ent_456" } }] } }) } });
    expect((await POST(makeRequest("{}"))).status).toBe(200);
    constructEvent.mockReturnValue({ created: older, type: "customer.subscription.updated", data: { object: fakeSubscription({ items: { data: [{ price: { id: "price_pro_123" } }] } }) } });
    expect((await POST(makeRequest("{}"))).status).toBe(200);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan).toBe("business");

    // Una baja atrasada de una suscripción anterior tampoco degrada la vigente.
    constructEvent.mockReturnValue({ created: older - 50, type: "customer.subscription.deleted", data: { object: fakeSubscription({ id: "sub_vieja" }) } });
    expect((await POST(makeRequest("{}"))).status).toBe(200);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan).toBe("business");
  });
  it("does not provision unpaid subscriptions or accept mismatched checkout customers", async () => {
    const fresh = await createTestOrg("Unpaid checkout");
    try {
      await prisma.organization.update({ where: { id: fresh.id }, data: { stripeCustomerId: "cus_unpaid" } });
      await prisma.organizationModule.updateMany({ where: { organizationId: fresh.id }, data: { status: "SUSPENDED" } });
      constructEvent.mockReturnValue({ created: nextCreated(), type: "customer.subscription.updated", data: { object: fakeSubscription({ id: "sub_unpaid", customer: "cus_unpaid", status: "incomplete" }) } });
      expect((await POST(makeRequest("{}"))).status).toBe(200);
      expect(await prisma.organizationModule.count({ where: { organizationId: fresh.id, status: "ACTIVE" } })).toBe(0);
      constructEvent.mockReturnValue({ created: nextCreated(), type: "checkout.session.completed", data: { object: { metadata: { organizationId: fresh.id }, customer: "cus_other", subscription: "sub_other" } } });
      expect((await POST(makeRequest("{}"))).status).toBe(500);
      expect(await prisma.organizationModule.count({ where: { organizationId: fresh.id, status: "ACTIVE" } })).toBe(0);
    } finally { await cleanupOrg(fresh.id); }
  });

  it("preserves custom modules and base plan through subscription activation and cancellation", async () => {
    const custom = await createTestOrg("Custom subscription");
    try {
      await prisma.organization.update({ where: { id: custom.id }, data: { customPlan: true, plan: "starter", stripeCustomerId: "cus_custom_contract" } });
      const before = await prisma.organizationModule.findMany({ where: { organizationId: custom.id }, orderBy: { module: "asc" } });
      for (const type of ["customer.subscription.updated", "customer.subscription.deleted"]) {
        constructEvent.mockReturnValue({ created: nextCreated(), type, data: { object: fakeSubscription({ id: "sub_custom_contract", customer: "cus_custom_contract" }) } });
        expect((await POST(makeRequest("{}"))).status).toBe(200);
        expect((await prisma.organization.findUniqueOrThrow({ where: { id: custom.id } })).plan).toBe("starter");
        expect(await prisma.organizationModule.findMany({ where: { organizationId: custom.id }, orderBy: { module: "asc" } })).toEqual(before);
      }
    } finally { await cleanupOrg(custom.id); }
  });

});
