import { describe, it, expect } from "vitest";
import { can } from "./permissions";
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
