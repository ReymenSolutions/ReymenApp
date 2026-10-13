// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock(), isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN" }));

const { enableBlueprint } = await import("./admin/blueprints");
const { getOwnerConfigForm, saveOwnerConfig, listOwnerEditableCounts } = await import("./automation-config");

describe("el dueño ajusta solo lo que se le permitió", () => {
  let org: { id: string };
  let other: { id: string };
  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
    if (other) await cleanupOrg(other.id);
  });
  const setup = async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    org = await createTestOrg("Owner Config Org");
    other = await createTestOrg("Owner Config Other");
    for (const o of [org, other]) {
      for (const mod of ["AUTOMATIONS", "FOOD_OPS", "REYMEN_POS"] as const) {
        await prisma.organizationModule.upsert({ where: { organizationId_module: { organizationId: o.id, module: mod } }, create: { organizationId: o.id, module: mod, status: "ACTIVE", source: "ADMIN_GRANTED" }, update: { status: "ACTIVE" } });
      }
      await enableBlueprint({ orgId: o.id, key: "customer_recovery" });
    }
    const a = await prisma.automation.findFirstOrThrow({ where: { organizationId: org.id, blueprintKey: "customer_recovery" } });
    return a.id;
  };
  const owner = () => authMock.mockResolvedValue(fakeSession({ id: "o1", role: "OWNER", organizationId: org.id }));

  it("solo ve los parámetros marcados como editables (el horario de silencio), no el resto", async () => {
    const id = await setup();
    owner();
    const form = await getOwnerConfigForm(id);
    expect(form.fields.map((f) => f.key).sort()).toEqual(["quietEnd", "quietStart"]);
    expect(Object.keys(form.values).sort()).toEqual(["quietEnd", "quietStart"]);
    expect((await listOwnerEditableCounts())[id]).toBe(2);
  });

  it("guarda lo editable (auditado como del dueño) y rechaza cambiar lo que no le toca", async () => {
    const id = await setup();
    owner();
    const ok = await saveOwnerConfig({ automationId: id, config: { quietStart: 22, quietEnd: 8 } });
    expect(ok).toEqual({ success: true, changed: expect.arrayContaining(["quietStart", "quietEnd"]) });
    const row = await prisma.automation.findFirstOrThrow({ where: { id } });
    expect(row.config).toMatchObject({ quietStart: 22, quietEnd: 8 });
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "automation.config" } })).toBe(1);

    await expect(saveOwnerConfig({ automationId: id, config: { minVisits: 1 } })).rejects.toThrow(/permiso/i);
    await expect(saveOwnerConfig({ automationId: id, config: { quietStart: 99 } })).resolves.toMatchObject({ success: false });
    expect(await prisma.automation.findFirstOrThrow({ where: { id } }).then((r) => (r.config as Record<string, unknown>).minVisits ?? 3)).toBe(3);
  });

  it("no toca el estado ni el envío real, y no deja ver ni editar automatizaciones de otro negocio", async () => {
    const id = await setup();
    const before = await prisma.automation.findFirstOrThrow({ where: { id } });
    owner();
    await saveOwnerConfig({ automationId: id, config: { quietStart: 20, status: "ACTIVE", dryRun: false } });
    const after = await prisma.automation.findFirstOrThrow({ where: { id } });
    expect([after.status, after.dryRun]).toEqual([before.status, before.dryRun]);
    const foreign = (await prisma.automation.findFirstOrThrow({ where: { organizationId: other.id } })).id;
    await expect(getOwnerConfigForm(foreign)).rejects.toThrow(/no encontrada/i);
    await expect(saveOwnerConfig({ automationId: foreign, config: { quietStart: 1 } })).rejects.toThrow(/no encontrada/i);
  });

  it("quien no administra la cuenta no puede ajustar nada", async () => {
    const id = await setup();
    authMock.mockResolvedValue(fakeSession({ id: "a1", role: "AGENT", organizationId: org.id }));
    await expect(getOwnerConfigForm(id)).rejects.toThrow(/autorizado/i);
    await expect(saveOwnerConfig({ automationId: id, config: { quietStart: 1 } })).rejects.toThrow(/autorizado/i);
    expect(await listOwnerEditableCounts()).toEqual({});
  });
});
