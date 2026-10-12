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

const lib = vi.hoisted(() => ({
  addSmartcardMember: vi.fn(async () => "added" as const),
  linkSmartcardCompany: vi.fn(async () => ({ id: "c1", name: "Villa", slug: "villa" })),
  removeSmartcardMember: vi.fn(async () => {}),
  unlinkSmartcardCompany: vi.fn(async () => {}),
  planMemberLimit: (plan: string) => (plan === "business" ? null : plan === "professional" ? 10 : 2),
  syncSmartcardMemberLimit: vi.fn(async () => "updated" as const),
  syncSmartcardMemberLimitForPlan: vi.fn(async () => "updated" as const),
}));
vi.mock("@/lib/smartcard-link", () => lib);

const {
  addSmartcardMemberAction,
  linkSmartcardCompanyAction,
  removeSmartcardMemberAction,
  syncSmartcardMemberLimitAction,
  unlinkSmartcardCompanyAction,
} =
  await import("./smartcard-link");

describe("SmartCard link actions", () => {
  const orgs: string[] = [];
  afterEach(async () => {
    for (const id of orgs.splice(0)) await cleanupOrg(id);
    vi.clearAllMocks();
  });

  it("CRITICAL: refuses anyone who isn't a platform admin, including the client's owner", async () => {
    const org = await createTestOrg("SC Denied Org");
    orgs.push(org.id);
    authMock.mockResolvedValue(fakeSession({ id: "owner", role: "OWNER", organizationId: org.id }));
    await expect(linkSmartcardCompanyAction({ orgId: org.id, companyId: "c1" })).rejects.toThrow(/autorizado/i);
    await expect(unlinkSmartcardCompanyAction({ orgId: org.id })).rejects.toThrow(/autorizado/i);
    await expect(addSmartcardMemberAction({ orgId: org.id, userId: "u", role: "owner" })).rejects.toThrow(/autorizado/i);
    await expect(removeSmartcardMemberAction({ orgId: org.id, memberId: "m" })).rejects.toThrow(/autorizado/i);
    expect(lib.linkSmartcardCompany).not.toHaveBeenCalled();
  });

  it("links, gives access only to the client's own users, and logs everything", async () => {
    const org = await createTestOrg("SC Org");
    const other = await createTestOrg("SC Other Org");
    orgs.push(org.id, other.id);
    const admin = await prisma.user.create({ data: { email: `sc-admin-${Date.now()}@test.local`, name: "Admin", role: "SUPER_ADMIN" } });
    const member = await prisma.user.create({ data: { email: `sc-owner-${Date.now()}@test.local`, role: "OWNER", organizationId: org.id } });
    const outsider = await prisma.user.create({ data: { email: `sc-out-${Date.now()}@test.local`, role: "OWNER", organizationId: other.id } });
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "SUPER_ADMIN", organizationId: null }));

    await linkSmartcardCompanyAction({ orgId: org.id, companyId: "c1" });
    expect(lib.linkSmartcardCompany).toHaveBeenCalledWith(org.id, "c1");
    // Al vincular, el límite de integrantes de SmartCard toma el del plan.
    expect(lib.syncSmartcardMemberLimitForPlan).toHaveBeenCalledWith(org.id, "starter");

    await expect(addSmartcardMemberAction({ orgId: org.id, userId: outsider.id, role: "owner" })).rejects.toThrow(/no pertenece/);
    await expect(addSmartcardMemberAction({ orgId: org.id, userId: member.id, role: "superadmin" as "owner" })).rejects.toThrow();
    expect(lib.addSmartcardMember).not.toHaveBeenCalled();

    expect(await addSmartcardMemberAction({ orgId: org.id, userId: member.id, role: "owner" })).toBe("added");
    expect(lib.addSmartcardMember).toHaveBeenCalledWith(org.id, member.email, "owner");

    await removeSmartcardMemberAction({ orgId: org.id, memberId: "m1", email: member.email });
    await unlinkSmartcardCompanyAction({ orgId: org.id });

    const actions = (await prisma.auditLog.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    expect(actions).toEqual([
      "client.smartcard_link",
      "client.smartcard_member_add",
      "client.smartcard_member_remove",
      "client.smartcard_unlink",
    ]);
    await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it("applies the plan's member limit and refuses non-admins", async () => {
    const org = await createTestOrg("SC Limit Org");
    orgs.push(org.id);
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "professional" } });
    authMock.mockResolvedValue(fakeSession({ id: "owner", role: "OWNER", organizationId: org.id }));
    await expect(syncSmartcardMemberLimitAction({ orgId: org.id })).rejects.toThrow(/autorizado/i);

    const admin = await prisma.user.create({ data: { email: `sc-admin3-${Date.now()}@test.local`, name: "Admin", role: "SUPER_ADMIN" } });
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "SUPER_ADMIN", organizationId: null }));
    expect(await syncSmartcardMemberLimitAction({ orgId: org.id })).toBe("updated");
    expect(lib.syncSmartcardMemberLimit).toHaveBeenCalledWith(org.id, 10);

    lib.syncSmartcardMemberLimit.mockResolvedValueOnce("no_module" as never);
    await expect(syncSmartcardMemberLimitAction({ orgId: org.id })).rejects.toThrow(/módulo SmartCard/);
    await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
    await prisma.user.delete({ where: { id: admin.id } });
  });

  it("rejects linking a client that doesn't exist", async () => {
    const admin = await prisma.user.create({ data: { email: `sc-admin2-${Date.now()}@test.local`, name: "Admin", role: "SUPER_ADMIN" } });
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "SUPER_ADMIN", organizationId: null }));
    await expect(linkSmartcardCompanyAction({ orgId: "missing-org", companyId: "c1" })).rejects.toThrow(/no existe/);
    await prisma.user.delete({ where: { id: admin.id } });
  });
});
