// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("stripe helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("isStripeConfigured is false without STRIPE_SECRET_KEY", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const { isStripeConfigured } = await import("./stripe");
    expect(isStripeConfigured()).toBe(false);
  });

  it("isStripeConfigured is true once STRIPE_SECRET_KEY is set", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    const { isStripeConfigured } = await import("./stripe");
    expect(isStripeConfigured()).toBe(true);
  });

  it("getStripeClient returns null without a key, a client with one", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const mod1 = await import("./stripe");
    expect(mod1.getStripeClient()).toBeNull();

    vi.resetModules();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_dummy");
    const mod2 = await import("./stripe");
    expect(mod2.getStripeClient()).not.toBeNull();
  });

  it("planForPriceId maps a configured price id back to its plan", async () => {
    vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_pro_123");
    vi.stubEnv("STRIPE_PRICE_BUSINESS", "price_ent_456");
    const { planForPriceId } = await import("./stripe");

    expect(planForPriceId("price_pro_123")).toBe("professional");
    expect(planForPriceId("price_ent_456")).toBe("business");
  });

  it("planForPriceId returns null for an unknown or missing price id", async () => {
    vi.stubEnv("STRIPE_PRICE_PROFESSIONAL", "price_pro_123");
    const { planForPriceId } = await import("./stripe");

    expect(planForPriceId("price_unknown")).toBeNull();
    expect(planForPriceId(null)).toBeNull();
    expect(planForPriceId(undefined)).toBeNull();
  });
});
