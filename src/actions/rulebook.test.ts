// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: (r: string) => r === "SUPER_ADMIN" || r === "ADMIN" }));

const { saveRulebook } = await import("./rulebook");

describe("saveRulebook", () => {
  let orgId: string | undefined;
  afterEach(async () => {
    if (orgId) await cleanupOrg(orgId);
    orgId = undefined;
  });

  it("rechaza sin sesión y a quien no puede gestionar la base de conocimiento", async () => {
    authMock.mockResolvedValue(null);
    await expect(saveRulebook({ voice: "x", greeting: "", rules: "", pricing: "" })).rejects.toThrow(/autorizado/i);
    const org = await createTestOrg("Rulebook Perm");
    orgId = org.id;
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "VIEWER", organizationId: org.id }));
    await expect(saveRulebook({ voice: "x", greeting: "", rules: "", pricing: "" })).rejects.toThrow(/autorizado/i);
    expect(await prisma.businessRulebook.count({ where: { organizationId: org.id } })).toBe(0);
  });

  it("crea y luego actualiza la misma fila, limpia el texto y guarda a quién lo editó", async () => {
    const org = await createTestOrg("Rulebook Save");
    orgId = org.id;
    const user = await prisma.user.create({ data: { email: `rb-${Date.now()}@example.com`, name: "Dueño", role: "OWNER", organizationId: org.id, passwordHash: "x" } });
    authMock.mockResolvedValue(fakeSession({ id: user.id, role: "OWNER", organizationId: org.id }));
    await saveRulebook({ voice: "  Directo  ", greeting: "Hola", rules: "", pricing: "" });
    await saveRulebook({ voice: "Cálido", greeting: "Hola", rules: "No inventes precios", pricing: "" });
    const rows = await prisma.businessRulebook.findMany({ where: { organizationId: org.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ voice: "Cálido", rules: "No inventes precios", updatedById: user.id });
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "rulebook.update" } })).toBe(2);
    await prisma.user.delete({ where: { id: user.id } });
  });

  it("nunca escribe en otra organización: usa solo la de la sesión", async () => {
    const mine = await createTestOrg("Rulebook Mine");
    const other = await createTestOrg("Rulebook Other");
    orgId = mine.id;
    try {
      authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: mine.id }));
      await saveRulebook({ voice: "mío", greeting: "", rules: "", pricing: "" });
      expect(await prisma.businessRulebook.count({ where: { organizationId: other.id } })).toBe(0);
    } finally {
      await cleanupOrg(other.id);
    }
  });
});
