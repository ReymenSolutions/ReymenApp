// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { invalidateSessionCache, validateSession } from "./session-guard";
import type { Session } from "next-auth";

const sessionFor = (id: string, role: string, organizationId: string | null, sv = 0) =>
  ({ user: { id, role, organizationId, theme: "light", language: "es", sessionVersion: sv }, expires: "2999-01-01" }) as unknown as Session;

// AUD-004: la sesión (JWT) no sobrevive a la baja, al cambio de rol, a la suspensión de la organización ni al cambio de contraseña.
describe("validateSession", () => {
  let org: { id: string };
  let user: { id: string };
  beforeAll(async () => {
    org = await createTestOrg("Session Guard");
    user = await createTestUser(org.id, "OWNER", "session-guard");
  });
  afterAll(async () => { await cleanupOrg(org.id); });
  beforeEach(async () => {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: true, role: "OWNER", sessionVersion: 0 } });
    await prisma.organization.update({ where: { id: org.id }, data: { isActive: true } });
    invalidateSessionCache();
  });

  it("deja pasar una sesión vigente", async () => {
    expect(await validateSession(sessionFor(user.id, "OWNER", org.id))).not.toBeNull();
  });

  it("rechaza a quien fue dado de baja", async () => {
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    expect(await validateSession(sessionFor(user.id, "OWNER", org.id))).toBeNull();
  });

  it("toma el rol vigente, no el del token (bajar de OWNER a VIEWER surte efecto)", async () => {
    await prisma.user.update({ where: { id: user.id }, data: { role: "VIEWER" } });
    const s = await validateSession(sessionFor(user.id, "OWNER", org.id));
    expect(s?.user.role).toBe("VIEWER");
  });

  it("rechaza si la organización fue suspendida", async () => {
    await prisma.organization.update({ where: { id: org.id }, data: { isActive: false } });
    expect(await validateSession(sessionFor(user.id, "OWNER", org.id))).toBeNull();
  });

  it("rechaza las sesiones emitidas antes de cambiar la contraseña", async () => {
    await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    expect(await validateSession(sessionFor(user.id, "OWNER", org.id, 0))).toBeNull();
    expect(await validateSession(sessionFor(user.id, "OWNER", org.id, 1))).not.toBeNull();
  });

  it("un usuario que ya no existe no entra", async () => {
    expect(await validateSession(sessionFor("no-existe", "OWNER", org.id))).toBeNull();
  });

  // Preferencias al suplantar: son del admin que navega, no de la persona suplantada.
  describe("suplantación", () => {
    it("toma tema e idioma del admin real, no del token ni del cliente", async () => {
      const admin = await createTestUser(null, "SUPER_ADMIN", "imp-admin");
      await prisma.user.update({ where: { id: admin.id }, data: { theme: "dark", language: "en" } });
      await prisma.user.update({ where: { id: user.id }, data: { theme: "light", language: "es" } });
      const s = sessionFor(user.id, "OWNER", org.id);
      s.user.theme = "light";
      s.user.language = "es";
      (s.user as unknown as { impersonating: unknown }).impersonating = { adminId: admin.id, adminName: null, adminEmail: admin.email };
      const out = await validateSession(s);
      expect(out?.user.theme).toBe("dark");
      expect(out?.user.language).toBe("en");
      await prisma.user.delete({ where: { id: admin.id } });
    });
  });
});
