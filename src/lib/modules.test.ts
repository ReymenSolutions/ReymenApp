// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { hasModule, assertModuleEnabled, getEnabledModules } from "@/lib/modules";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

describe("modules", () => {
  let org: { id: string };

  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
  });

  it("createTestOrg grants CRM, AI_WHATSAPP and AUTOMATIONS by default (mirrors the backfill)", async () => {
    org = await createTestOrg("Modules Default Org");
    await expect(hasModule(org.id, "CRM")).resolves.toBe(true);
    await expect(hasModule(org.id, "AI_WHATSAPP")).resolves.toBe(true);
    await expect(hasModule(org.id, "AUTOMATIONS")).resolves.toBe(true);
  });

  it("a module with no entitlement row at all is treated as not enabled", async () => {
    org = await createTestOrg("Modules No Row Org");
    await expect(hasModule(org.id, "NFC_QR")).resolves.toBe(false);
    await expect(hasModule(org.id, "MARKETING_ADS")).resolves.toBe(false);
    await expect(hasModule(org.id, "WORKSHOP")).resolves.toBe(false);
  });

  it("a SUSPENDED module is not enabled", async () => {
    org = await createTestOrg("Modules Suspended Org");
    await prisma.organizationModule.update({
      where: { organizationId_module: { organizationId: org.id, module: "CRM" } },
      data: { status: "SUSPENDED", suspendedAt: new Date() },
    });
    await expect(hasModule(org.id, "CRM")).resolves.toBe(false);
  });

  it("a CANCELLED module is not enabled", async () => {
    org = await createTestOrg("Modules Cancelled Org");
    await prisma.organizationModule.update({
      where: { organizationId_module: { organizationId: org.id, module: "AUTOMATIONS" } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await expect(hasModule(org.id, "AUTOMATIONS")).resolves.toBe(false);
  });

  it("assertModuleEnabled throws a clear error when the module isn't active", async () => {
    org = await createTestOrg("Modules Assert Org");
    await expect(assertModuleEnabled(org.id, "NFC_QR")).rejects.toThrow(/Smart Cards/i);
    await expect(assertModuleEnabled(org.id, "WORKSHOP")).rejects.toThrow(/Talleres/i);
    await expect(assertModuleEnabled(org.id, "CRM")).resolves.toBeUndefined();
  });

  it("getEnabledModules returns only ACTIVE modules, not suspended/cancelled/absent ones", async () => {
    org = await createTestOrg("Modules List Org");
    await prisma.organizationModule.update({
      where: { organizationId_module: { organizationId: org.id, module: "AI_WHATSAPP" } },
      data: { status: "SUSPENDED" },
    });
    const enabled = await getEnabledModules(org.id);
    expect(enabled.sort()).toEqual(["AUTOMATIONS", "CRM"]);
  });
});
