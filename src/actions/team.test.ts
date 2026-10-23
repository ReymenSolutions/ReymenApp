// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { inviteTeamMember, removeTeamMember, updateTeamMember } = await import("./team");

describe("team actions", () => {
  let org: { id: string };
  let owner: { id: string };
  let viewer: { id: string };
  let otherOrg: { id: string };

  beforeAll(async () => {
    org = await createTestOrg("Team Test Org");
    otherOrg = await createTestOrg("Team Test Other Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "professional" } });
    owner = await createTestUser(org.id, "OWNER", "team-owner");
    viewer = await createTestUser(org.id, "VIEWER", "team-viewer");
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(otherOrg.id);
  });

  it("denies inviteTeamMember to a role without team:manage (VIEWER)", async () => {
    authMock.mockResolvedValue(fakeSession({ id: viewer.id, role: "VIEWER", organizationId: org.id }));
    await expect(
      inviteTeamMember({ name: "New Hire", email: `nh.${Date.now()}@test.local`, role: "AGENT", password: "password123" })
    ).rejects.toThrow(/permisos/i);
  });

  it("lets OWNER invite a team member into their own org", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const email = `agent.${Date.now()}@test.local`;
    const result = await inviteTeamMember({ name: "New Agent", email, role: "AGENT", password: "password123" });
    expect(result.success).toBe(true);

    const created = await prisma.user.findUnique({ where: { email } });
    expect(created?.organizationId).toBe(org.id);
    expect(created?.role).toBe("AGENT");
    // Password must be hashed, never stored in plain text.
    expect(created?.passwordHash).not.toBe("password123");
  });

  it("rejects inviting a duplicate email", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const ownerRecord = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    await expect(
      inviteTeamMember({ name: "Dupe", email: ownerRecord.email, role: "AGENT", password: "password123" })
    ).rejects.toThrow(/ya existe/i);
  });

  it("cannot remove or edit a user belonging to another organization", async () => {
    const otherOwner = await createTestUser(otherOrg.id, "OWNER", "other-owner");
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));

    await expect(removeTeamMember(otherOwner.id)).rejects.toThrow(/no encontrado/i);
    await expect(updateTeamMember(otherOwner.id, { name: "Hijacked", role: "VIEWER" })).rejects.toThrow(/no encontrado/i);

    const untouched = await prisma.user.findUnique({ where: { id: otherOwner.id } });
    expect(untouched?.name).toBe("Test User");
    expect(untouched?.isActive).toBe(true);
  });

  it("a platform admin who is also a member of the org can't be edited or removed from the client's portal", async () => {
    const superMember = await createTestUser(org.id, "SUPER_ADMIN", "team-super-member");
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await expect(removeTeamMember(superMember.id)).rejects.toThrow(/administrador de la plataforma/i);
    await expect(updateTeamMember(superMember.id, { name: "Rebajado", role: "VIEWER" })).rejects.toThrow(/administrador de la plataforma/i);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: superMember.id } })).role).toBe("SUPER_ADMIN");
  });

  it("prevents a user from removing themselves", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    await expect(removeTeamMember(owner.id)).rejects.toThrow(/ti mismo/i);
  });

  it("blocks inviting a team member once the org's plan limit is reached", async () => {
    const limitedOrg = await createTestOrg("Team Plan Limit Org");
    await prisma.organization.update({ where: { id: limitedOrg.id }, data: { plan: "starter" } });
    const limitedOwner = await createTestUser(limitedOrg.id, "OWNER", "limited-owner");
    await createTestUser(limitedOrg.id, "AGENT", "limited-agent");
    authMock.mockResolvedValue(fakeSession({ id: limitedOwner.id, role: "OWNER", organizationId: limitedOrg.id }));

    await expect(
      inviteTeamMember({ name: "One Too Many", email: `otm.${Date.now()}@test.local`, role: "AGENT", password: "password123" })
    ).rejects.toThrow(/límite de usuarios/);

    await cleanupOrg(limitedOrg.id);
  });
});
