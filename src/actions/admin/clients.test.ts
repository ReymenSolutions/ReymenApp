// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN",
}));

const { createClient, updateClientStatus, changePlan } = await import("./clients");

describe("admin/clients actions", () => {
  const createdOrgIds: string[] = [];

  afterEach(async () => {
    while (createdOrgIds.length) {
      const id = createdOrgIds.pop()!;
      await cleanupOrg(id);
    }
  });

  it("denies createClient to a non-admin session", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: null }));
    const fd = new FormData();
    fd.set("orgName", "Should Fail Inc");
    fd.set("userName", "Nope");
    fd.set("userEmail", `nope.${Date.now()}@test.local`);
    fd.set("password", "password123");
    await expect(createClient(fd)).rejects.toThrow(/autorizado/i);
  });

  // Regression test for the "Datos inválidos" 500 found when Industria was left unselected:
  // formData.get() returns null for an omitted field, which z.string().optional() rejects.
  it("creates a client when the optional industry field is omitted entirely", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const fd = new FormData();
    fd.set("orgName", `No Industry Co ${Date.now()}`);
    fd.set("userName", "Owner Name");
    fd.set("userEmail", `owner.${Date.now()}@test.local`);
    fd.set("password", "password123");
    // orgIndustry intentionally not set — formData.get("orgIndustry") will be null here.

    const result = await createClient(fd);
    expect(result.success).toBe(true);
    createdOrgIds.push(result.orgId);

    const org = await prisma.organization.findUnique({ where: { id: result.orgId } });
    expect(org?.industry).toBeNull();
  });

  it("creates the OWNER user atomically with the organization", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const email = `owner2.${Date.now()}@test.local`;
    const fd = new FormData();
    fd.set("orgName", `With Owner Co ${Date.now()}`);
    fd.set("orgIndustry", "clinic");
    fd.set("userName", "Owner Two");
    fd.set("userEmail", email);
    fd.set("password", "password123");

    const result = await createClient(fd);
    createdOrgIds.push(result.orgId);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.organizationId).toBe(result.orgId);
    expect(user?.role).toBe("OWNER");
  });

  it("suspending an organization sets isActive to false and audits it", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const org = await createTestOrg("Suspend Test Org");
    createdOrgIds.push(org.id);

    await updateClientStatus(org.id, false);

    const updated = await prisma.organization.findUnique({ where: { id: org.id } });
    expect(updated?.isActive).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: { organizationId: org.id, action: "client.status_change" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
  });

  it("stores the agreed MXN price (any plan) and clears it when the admin leaves it empty", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const org = await createTestOrg("Custom Price Org");
    createdOrgIds.push(org.id);

    await changePlan(org.id, "business", 18500);
    let updated = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(updated.plan).toBe("business");
    expect(Number(updated.customMonthlyPriceMxn)).toBe(18500);

    await changePlan(org.id, "professional", null);
    updated = await prisma.organization.findUniqueOrThrow({ where: { id: org.id } });
    expect(updated.plan).toBe("professional");
    expect(updated.customMonthlyPriceMxn).toBeNull();
  });

  it("rejects a non-positive custom price", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    const org = await createTestOrg("Bad Custom Price Org");
    createdOrgIds.push(org.id);
    await expect(changePlan(org.id, "business", 0)).rejects.toThrow(/mayor a 0/);
  });
});
