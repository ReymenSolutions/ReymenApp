import { describe, it, expect } from "vitest";
import { can, PLAN_LIMITS } from "./permissions";
import type { UserRole } from "@prisma/client";

describe("can", () => {
  it("grants team:manage to OWNER, ADMIN and SUPER_ADMIN", () => {
    expect(can("OWNER", "team:manage")).toBe(true);
    expect(can("ADMIN", "team:manage")).toBe(true);
    expect(can("SUPER_ADMIN", "team:manage")).toBe(true);
  });

  it("denies team:manage to MANAGER, AGENT, VIEWER and CLIENT", () => {
    expect(can("MANAGER", "team:manage")).toBe(false);
    expect(can("AGENT", "team:manage")).toBe(false);
    expect(can("VIEWER", "team:manage")).toBe(false);
    expect(can("CLIENT", "team:manage")).toBe(false);
  });

  it("lets VIEWER update lead status but not create or delete leads", () => {
    expect(can("VIEWER", "leads:update_status")).toBe(true);
    expect(can("VIEWER", "leads:create")).toBe(false);
    expect(can("VIEWER", "leads:delete")).toBe(false);
  });

  it("lets AGENT create leads but not delete them", () => {
    expect(can("AGENT", "leads:create")).toBe(true);
    expect(can("AGENT", "leads:delete")).toBe(false);
  });

  it("returns false for a role with no permission table (defensive)", () => {
    expect(can("NOT_A_REAL_ROLE" as UserRole, "team:manage")).toBe(false);
  });
});

describe("PLAN_LIMITS", () => {
  it("orders plans from lowest to highest capacity", () => {
    expect(PLAN_LIMITS.starter.leads).toBeLessThan(PLAN_LIMITS.professional.leads);
    expect(PLAN_LIMITS.professional.leads).toBeLessThan(PLAN_LIMITS.business.leads);
    expect(PLAN_LIMITS.starter.users).toBeLessThan(PLAN_LIMITS.professional.users);
    expect(PLAN_LIMITS.professional.users).toBeLessThan(PLAN_LIMITS.business.users);
  });

  it("has a human label for every plan", () => {
    for (const plan of Object.values(PLAN_LIMITS)) {
      expect(plan.label).toBeTruthy();
    }
  });
});
