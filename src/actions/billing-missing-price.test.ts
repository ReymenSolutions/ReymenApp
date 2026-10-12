// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

// STRIPE_PRICE_PROFESSIONAL is deliberately left unset in this isolated file —
// src/lib/stripe.ts reads its price-id env vars once at module load, so this
// scenario needs its own module graph rather than sharing billing.test.ts's.
// (Business ya no se cobra en línea: su precio se pacta por cliente.)
vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "");

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
vi.mock("stripe", () => ({
  default: class MockStripe {
    customers = { create: vi.fn() };
    checkout = { sessions: { create: vi.fn() } };
  },
}));

const { createCheckoutSession } = await import("./billing");

describe("createCheckoutSession with an unconfigured plan price", () => {
  it("throws a clear error instead of calling Stripe", async () => {
    const org = await createTestOrg("Missing Price Org");
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: org.id }));

    await expect(createCheckoutSession("professional")).rejects.toThrow(/precio de stripe/i);

    await cleanupOrg(org.id);
  });
});
