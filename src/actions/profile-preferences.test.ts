// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";

const authMock = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/lib/auth", () => ({ auth: async () => authMock.session }));

const { updatePreferences } = await import("./profile");

let orgId = "";
let client: { id: string };
let admin: { id: string; email: string };

beforeAll(async () => {
  const org = await createTestOrg("PrefsImp");
  orgId = org.id;
  client = await createTestUser(org.id, "OWNER", "prefs-client");
  admin = await createTestUser(null, "SUPER_ADMIN", "prefs-admin");
});
afterAll(async () => {
  await prisma.user.delete({ where: { id: admin.id } }).catch(() => {});
  await cleanupOrg(orgId);
});

describe("updatePreferences", () => {
  it("guarda tema e idioma del usuario que navega", async () => {
    authMock.session = { user: { id: client.id, role: "OWNER", organizationId: orgId, impersonating: null } };
    await updatePreferences({ theme: "dark", language: "en" });
    expect(await prisma.user.findUnique({ where: { id: client.id }, select: { theme: true, language: true } })).toEqual({ theme: "dark", language: "en" });
  });

  it("al suplantar guarda en el admin y NO toca la cuenta del cliente", async () => {
    await prisma.user.update({ where: { id: client.id }, data: { theme: "light", language: "es" } });
    authMock.session = { user: { id: client.id, role: "OWNER", organizationId: orgId, impersonating: { adminId: admin.id, adminName: null, adminEmail: admin.email } } };
    await updatePreferences({ theme: "dark", language: "en" });
    expect(await prisma.user.findUnique({ where: { id: admin.id }, select: { theme: true, language: true } })).toEqual({ theme: "dark", language: "en" });
    expect(await prisma.user.findUnique({ where: { id: client.id }, select: { theme: true, language: true } })).toEqual({ theme: "light", language: "es" });
  });
});
