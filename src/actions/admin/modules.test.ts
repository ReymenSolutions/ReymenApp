// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN",
}));

const { syncModulesToPlan, getOrganizationModules, setOrganizationModule } = await import("./modules");

describe("getOrganizationModules", () => {
  it("CRITICAL: refuses a non-admin caller (it is a public server action)", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: "org_x" }));
    await expect(getOrganizationModules("org_x")).rejects.toThrow(/no autorizado/i);
    authMock.mockResolvedValue(null);
    await expect(getOrganizationModules("org_x")).rejects.toThrow(/no autorizado/i);
  });
});

describe("syncModulesToPlan", () => {
  let org: { id: string };

  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
  });

  it("denies a non-admin session", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: null }));
    org = await createTestOrg("Sync Modules Denied Org");
    await expect(syncModulesToPlan(org.id)).rejects.toThrow(/autorizado/i);
  });

  it("activates modules the plan includes that aren't already active, and is additive only", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    org = await createTestOrg("Sync Modules Additive Org");
    // starter plan (the org's default) → PLAN_MODULES.starter = ["CRM"] only.
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "starter" } });
    // Suspend CRM and AI_WHATSAPP; leave AUTOMATIONS active (outside the plan's list).
    await prisma.organizationModule.updateMany({
      where: { organizationId: org.id, module: "CRM" },
      data: { status: "SUSPENDED" },
    });
    await prisma.organizationModule.update({
      where: { organizationId_module: { organizationId: org.id, module: "AI_WHATSAPP" } },
      data: { status: "SUSPENDED", source: "ADMIN_GRANTED" },
    });

    const result = await syncModulesToPlan(org.id);
    expect(result.success).toBe(true);
    expect(result.activatedModules).toEqual(["CRM"]);

    const crm = await prisma.organizationModule.findUnique({
      where: { organizationId_module: { organizationId: org.id, module: "CRM" } },
    });
    expect(crm?.status).toBe("ACTIVE");
    expect(crm?.source).toBe("SUBSCRIBED");

    // AI_WHATSAPP is outside the starter plan's module list — sync must never touch it.
    const whatsapp = await prisma.organizationModule.findUnique({
      where: { organizationId_module: { organizationId: org.id, module: "AI_WHATSAPP" } },
    });
    expect(whatsapp?.status).toBe("SUSPENDED");
    expect(whatsapp?.source).toBe("ADMIN_GRANTED");

    // AUTOMATIONS was already ACTIVE and outside the plan's list — untouched too.
    const automations = await prisma.organizationModule.findUnique({
      where: { organizationId_module: { organizationId: org.id, module: "AUTOMATIONS" } },
    });
    expect(automations?.status).toBe("ACTIVE");
  });

  it("is idempotent — running it again once aligned makes no changes", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    org = await createTestOrg("Sync Modules Idempotent Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "starter" } });

    const first = await syncModulesToPlan(org.id);
    expect(first.activatedModules).toEqual([]); // CRM already ACTIVE by default from createTestOrg

    const second = await syncModulesToPlan(org.id);
    expect(second.activatedModules).toEqual([]);
  });

  it("creates a module entitlement from scratch when the org has no row for it yet", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    org = await createTestOrg("Sync Modules From Scratch Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "professional" } });
    // professional plan includes AUTOMATIONS — delete its row entirely to simulate "never had it".
    await prisma.organizationModule.delete({
      where: { organizationId_module: { organizationId: org.id, module: "AUTOMATIONS" } },
    });

    const result = await syncModulesToPlan(org.id);
    expect(result.activatedModules).toEqual(["AUTOMATIONS"]);

    const automations = await prisma.organizationModule.findUnique({
      where: { organizationId_module: { organizationId: org.id, module: "AUTOMATIONS" } },
    });
    expect(automations?.status).toBe("ACTIVE");
    expect(automations?.source).toBe("SUBSCRIBED");
  });
});

describe("setOrganizationModule — Sin habilitar", () => {
  let org: { id: string };
  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
  });

  it("NOT_ENABLED quita el módulo por completo (vuelve a 'sin habilitar'), lo deja en la bitácora y se puede volver a activar", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    org = await createTestOrg("Not Enabled Org");
    await setOrganizationModule({ orgId: org.id, module: "NFC_QR", status: "ACTIVE", source: "ADMIN_GRANTED" });
    expect((await getOrganizationModules(org.id)).find((m) => m.module === "NFC_QR")?.status).toBe("ACTIVE");

    await setOrganizationModule({ orgId: org.id, module: "NFC_QR", status: "NOT_ENABLED", source: "ADMIN_GRANTED" });
    expect((await getOrganizationModules(org.id)).find((m) => m.module === "NFC_QR")).toMatchObject({ status: null, source: null });
    expect(await prisma.organizationModule.count({ where: { organizationId: org.id, module: "NFC_QR" } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "client.module_change", resource: "OrganizationModule" } })).toBe(2);

    // Quitar un módulo que nunca estuvo habilitado no falla.
    await setOrganizationModule({ orgId: org.id, module: "MARKETING_ADS", status: "NOT_ENABLED", source: "ADMIN_GRANTED" });
    await setOrganizationModule({ orgId: org.id, module: "NFC_QR", status: "ACTIVE", source: "ADMIN_GRANTED" });
    expect((await getOrganizationModules(org.id)).find((m) => m.module === "NFC_QR")?.status).toBe("ACTIVE");
  });

  it("solo un admin puede quitarlo", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: null }));
    org = await createTestOrg("Not Enabled Denied Org");
    await expect(setOrganizationModule({ orgId: org.id, module: "NFC_QR", status: "NOT_ENABLED", source: "ADMIN_GRANTED" })).rejects.toThrow(/autorizado/i);
  });
});
