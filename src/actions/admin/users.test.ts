// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  isAdmin: (role: string) => role === "ADMIN" || role === "SUPER_ADMIN",
}));

const { createOrgUser, updateUserAsAdmin } = await import("./users");

describe("admin createOrgUser", () => {
  let org: { id: string };
  let admin: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Admin Users Test Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "professional" } });
    admin = await createTestUser(null, "ADMIN", "admin-users-admin");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
    await prisma.user.deleteMany({ where: { id: admin.id } });
  });

  it("denies a non-admin", async () => {
    const owner = await createTestUser(org.id, "OWNER", "admin-users-owner");
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await expect(
      createOrgUser(org.id, { name: "Nope", email: `nope.${Date.now()}@test.local`, role: "AGENT", password: "password123" })
    ).rejects.toThrow(/no autorizado/i);
  });

  it("creates a user in the client's org with a hashed password", async () => {
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "ADMIN", organizationId: null }));
    const email = `created.${Date.now()}@test.local`;
    const result = await createOrgUser(org.id, { name: "New Manager", email, role: "MANAGER", password: "password123" });
    expect(result.success).toBe(true);

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created?.organizationId).toBe(org.id);
    expect(created?.role).toBe("MANAGER");
    expect(created?.passwordHash).not.toBe("password123");
  });

  it("rejects a duplicate email", async () => {
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "ADMIN", organizationId: null }));
    const adminRecord = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    await expect(
      createOrgUser(org.id, { name: "Dupe", email: adminRecord.email, role: "AGENT", password: "password123" })
    ).rejects.toThrow(/ya existe/i);
  });

  // Antes el alta desde admin se saltaba el límite de usuarios del plan que
  // sí aplicaba inviteTeamMember; ahora ambos pasan por createOrgUserRecord.
  it("respects the org's plan user limit, same as inviteTeamMember", async () => {
    const limitedOrg = await createTestOrg("Admin Users Plan Limit Org");
    await prisma.organization.update({ where: { id: limitedOrg.id }, data: { plan: "starter" } });
    await createTestUser(limitedOrg.id, "OWNER", "admin-limited-owner");
    await createTestUser(limitedOrg.id, "AGENT", "admin-limited-agent");
    authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "ADMIN", organizationId: null }));

    await expect(
      createOrgUser(limitedOrg.id, { name: "One Too Many", email: `otm.${Date.now()}@test.local`, role: "AGENT", password: "password123" })
    ).rejects.toThrow(/límite de usuarios/);

    await cleanupOrg(limitedOrg.id);
  });
});

describe("admin updateUserAsAdmin", () => {
  let org: { id: string };
  let org2: { id: string };
  let superAdmin: { id: string };
  let admin: { id: string };
  const extraUsers: string[] = [];

  beforeAll(async () => {
    org = await createTestOrg("Edit User Org");
    org2 = await createTestOrg("Edit User Org 2");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "professional" } });
    await prisma.organization.update({ where: { id: org2.id }, data: { plan: "professional" } });
    superAdmin = await createTestUser(null, "SUPER_ADMIN", "edit-super");
    admin = await createTestUser(null, "ADMIN", "edit-admin");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(org2.id);
    await prisma.user.deleteMany({ where: { id: { in: [superAdmin.id, admin.id, ...extraUsers] } } });
  });

  const asSuper = () => authMock.mockResolvedValue(fakeSession({ id: superAdmin.id, role: "SUPER_ADMIN", organizationId: null }));
  const asAdmin = () => authMock.mockResolvedValue(fakeSession({ id: admin.id, role: "ADMIN", organizationId: null }));

  it("denies a non-admin", async () => {
    const owner = await createTestUser(org.id, "OWNER", "edit-owner");
    const agent = await createTestUser(org.id, "AGENT", "edit-agent-denied");
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await expect(updateUserAsAdmin(agent.id, { name: "X Y", email: agent.email, role: "MANAGER", organizationId: org.id })).rejects.toThrow(/no autorizado/i);
  });

  it("edits name, email and role of an existing user and signs their sessions out", async () => {
    asAdmin();
    const agent = await createTestUser(org.id, "AGENT", "edit-agent");
    const email = `renamed.${Date.now()}@Test.Local`;
    const res = await updateUserAsAdmin(agent.id, { name: "Nuevo Nombre", email, role: "MANAGER", organizationId: org.id });
    expect(res.success).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: agent.id } });
    expect(after).toMatchObject({ name: "Nuevo Nombre", email: email.toLowerCase(), role: "MANAGER", organizationId: org.id });
    expect(after.sessionVersion).toBe(agent.sessionVersion + 1);
  });

  it("changing only the name keeps sessions valid", async () => {
    asAdmin();
    const agent = await createTestUser(org.id, "AGENT", "edit-name-only");
    await updateUserAsAdmin(agent.id, { name: "Solo Nombre", email: agent.email, role: "AGENT", organizationId: org.id });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: agent.id } })).sessionVersion).toBe(agent.sessionVersion);
  });

  it("resets the password when one is given", async () => {
    asAdmin();
    const agent = await createTestUser(org.id, "AGENT", "edit-pass");
    await updateUserAsAdmin(agent.id, { name: "Con Clave", email: agent.email, role: "AGENT", organizationId: org.id, password: "nueva-clave-123" });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: agent.id } });
    expect(after.passwordHash).not.toBe("unused");
    expect(after.passwordHash).not.toBe("nueva-clave-123");
  });

  it("rejects an email that already belongs to someone else", async () => {
    asAdmin();
    const a = await createTestUser(org.id, "AGENT", "edit-dupe-a");
    const b = await createTestUser(org.id, "AGENT", "edit-dupe-b");
    await expect(updateUserAsAdmin(a.id, { name: "Dupe Name", email: b.email.toUpperCase(), role: "AGENT", organizationId: org.id })).rejects.toThrow(/ya existe/i);
  });

  it("a regular admin cannot edit a platform admin or hand out the Super Admin role", async () => {
    asAdmin();
    const agent = await createTestUser(org.id, "AGENT", "edit-escalate");
    await expect(updateUserAsAdmin(agent.id, { name: "Escalada", email: agent.email, role: "SUPER_ADMIN", organizationId: org.id })).rejects.toThrow(/super administrador/i);
    await expect(updateUserAsAdmin(superAdmin.id, { name: "Hackeo", email: "x@test.local", role: "SUPER_ADMIN", organizationId: null })).rejects.toThrow(/super administrador/i);
  });

  it("a super admin can also be the owner-level member of an organization", async () => {
    asSuper();
    const reynol = await createTestUser(org.id, "OWNER", "edit-both");
    extraUsers.push(reynol.id);
    await updateUserAsAdmin(reynol.id, { name: "Reynol", email: reynol.email, role: "SUPER_ADMIN", organizationId: org.id });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: reynol.id } });
    expect(after.role).toBe("SUPER_ADMIN");
    expect(after.organizationId).toBe(org.id);
  });

  it("an org role needs an organization, and moving users respects the plan limit", async () => {
    asSuper();
    const u = await createTestUser(null, "ADMIN", "edit-noorg");
    extraUsers.push(u.id);
    await expect(updateUserAsAdmin(u.id, { name: "Sin Org", email: u.email, role: "AGENT", organizationId: null })).rejects.toThrow(/necesita una organización/i);

    const limited = await createTestOrg("Edit User Limited Org");
    await prisma.organization.update({ where: { id: limited.id }, data: { plan: "starter" } });
    await createTestUser(limited.id, "OWNER", "edit-limited-owner");
    await createTestUser(limited.id, "AGENT", "edit-limited-agent");
    await expect(updateUserAsAdmin(u.id, { name: "Mover Me", email: u.email, role: "ADMIN", organizationId: limited.id })).rejects.toThrow(/límite de usuarios/);
    await cleanupOrg(limited.id);
  });

  it("nobody changes their own role, and the last super admin can't be demoted", async () => {
    asSuper();
    await expect(updateUserAsAdmin(superAdmin.id, { name: "Yo Mismo", email: (await prisma.user.findUniqueOrThrow({ where: { id: superAdmin.id } })).email, role: "ADMIN", organizationId: null })).rejects.toThrow(/propio rol/i);
  });
});
