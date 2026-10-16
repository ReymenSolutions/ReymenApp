// @vitest-environment node
import { describe, expect, it } from "vitest";
import { assertLoyaltyDemoDataOnly, assertLoyaltyDemoSeedAllowed } from "./demo-safety";

describe("destructive loyalty demo safeguards", () => {
  it("rejects implicit execution and production even with explicit demo opt-in", () => {
    expect(() => assertLoyaltyDemoSeedAllowed({})).toThrow("Demo bloqueada");
    expect(() => assertLoyaltyDemoSeedAllowed({ NODE_ENV: "production", ALLOW_LOYALTY_DEMO_SEED: "cafe-norte-demo" })).toThrow("Demo bloqueada");
    expect(() => assertLoyaltyDemoSeedAllowed({ NODE_ENV: "development", ALLOW_LOYALTY_DEMO_SEED: "another-org" })).toThrow("Demo bloqueada");
    expect(() => assertLoyaltyDemoSeedAllowed({ NODE_ENV: "development", ALLOW_LOYALTY_DEMO_SEED: "cafe-norte-demo" })).not.toThrow();
  });
  it("refuses to reset an organization containing any live program or customer", () => {
    expect(() => assertLoyaltyDemoDataOnly(1, 0)).toThrow("ajenos a la demo");
    expect(() => assertLoyaltyDemoDataOnly(0, 1)).toThrow("ajenos a la demo");
    expect(() => assertLoyaltyDemoDataOnly(0, 0)).not.toThrow();
  });
});
