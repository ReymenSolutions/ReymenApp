// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { logAudit } from "./audit";

describe("logAudit (AUD-019)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("si la bitácora falla no rompe la operación pero deja una señal en los logs, sin la metadata", async () => {
    vi.spyOn(prisma.auditLog, "create").mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(logAudit({ action: "x.test", resource: "Thing", resourceId: "t1", organizationId: "o1", metadata: { secreto: "NO-DEBE-SALIR" } })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(error.mock.calls);
    expect(line).toContain("x.test");
    expect(line).toContain("db down");
    expect(line).not.toContain("NO-DEBE-SALIR");
  });
});
