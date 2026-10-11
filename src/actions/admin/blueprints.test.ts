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

const { enableBlueprint, setBlueprintDryRun, disableBlueprint, getOrganizationBlueprints } = await import("./blueprints");

describe("blueprints (admin)", () => {
  let org: { id: string };
  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
  });
  const admin = () => authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));

  it("rechaza a quien no es admin", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: null }));
    await expect(enableBlueprint({ orgId: "x", key: "welcome_new_customer" })).rejects.toThrow(/autorizado/i);
    await expect(getOrganizationBlueprints("x")).rejects.toThrow(/autorizado/i);
  });

  it("exige los módulos del blueprint y nace en dry-run", async () => {
    admin();
    org = await createTestOrg("Blueprint Admin Org");
    await expect(enableBlueprint({ orgId: org.id, key: "welcome_new_customer" })).rejects.toThrow(/módulos/i);
    await expect(enableBlueprint({ orgId: org.id, key: "no-existe" })).rejects.toThrow(/no encontrada/i);

    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "ADMIN_GRANTED" } });
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "REYMEN_POS", status: "ACTIVE", source: "ADMIN_GRANTED" } });
    await enableBlueprint({ orgId: org.id, key: "welcome_new_customer" });
    await enableBlueprint({ orgId: org.id, key: "welcome_new_customer" }); // idempotente
    const rows = await prisma.automation.findMany({ where: { organizationId: org.id, blueprintKey: "welcome_new_customer" } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "ACTIVE", dryRun: true, trigger: "customer.created", blueprintVersion: 1, type: "blueprint" });

    const [row] = await getOrganizationBlueprints(org.id);
    expect(row.instance).toMatchObject({ dryRun: true, status: "ACTIVE" });
  });

  it("apaga el dry-run, pausa y no toca automatizaciones de otra organización", async () => {
    admin();
    org = await createTestOrg("Blueprint Toggle Org");
    const other = await createTestOrg("Blueprint Toggle Other");
    try {
      for (const o of [org, other]) {
        for (const mod of ["FOOD_OPS", "REYMEN_POS"] as const) {
          await prisma.organizationModule.create({ data: { organizationId: o.id, module: mod, status: "ACTIVE", source: "ADMIN_GRANTED" } });
        }
        await enableBlueprint({ orgId: o.id, key: "welcome_new_customer" });
      }
      const mine = await prisma.automation.findFirstOrThrow({ where: { organizationId: org.id } });
      const theirs = await prisma.automation.findFirstOrThrow({ where: { organizationId: other.id } });
      await setBlueprintDryRun({ orgId: org.id, automationId: mine.id, dryRun: false });
      expect((await prisma.automation.findUniqueOrThrow({ where: { id: mine.id } })).dryRun).toBe(false);
      await expect(setBlueprintDryRun({ orgId: org.id, automationId: theirs.id, dryRun: false })).rejects.toThrow(/no encontrada/i);
      await disableBlueprint({ orgId: org.id, automationId: mine.id });
      expect((await prisma.automation.findUniqueOrThrow({ where: { id: mine.id } })).status).toBe("PAUSED");
      expect((await prisma.automation.findUniqueOrThrow({ where: { id: theirs.id } })).dryRun).toBe(true);
    } finally {
      await cleanupOrg(other.id);
    }
  });
});
