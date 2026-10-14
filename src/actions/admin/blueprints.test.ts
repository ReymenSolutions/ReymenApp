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

describe("blueprints (admin): solapamiento con plantillas de n8n", () => {
  let org: { id: string };
  let templateId: string;
  afterEach(async () => {
    if (org) {
      await prisma.templateInstallation.deleteMany({ where: { organizationId: org.id } });
      await cleanupOrg(org.id);
    }
    if (templateId) {
      await prisma.templateVersion.deleteMany({ where: { templateId } });
      await prisma.automationTemplate.delete({ where: { id: templateId } });
      templateId = "";
    }
  });

  it("avisa de la plantilla n8n activa de la misma categoría y exige confirmar antes de pasar a envío real", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
    org = await createTestOrg("Blueprint Overlap Org");
    for (const mod of ["FOOD_OPS", "REYMEN_POS"] as const) await prisma.organizationModule.create({ data: { organizationId: org.id, module: mod, status: "ACTIVE", source: "ADMIN_GRANTED" } });
    const tpl = await prisma.automationTemplate.create({ data: { name: "Retención de Membresías — Gimnasio", description: "x", industry: "gym", category: "retention", isPublished: true, versions: { create: { version: "1.0.0", n8nWorkflowJson: {}, isLatest: true } } }, include: { versions: true } });
    templateId = tpl.id;
    await enableBlueprint({ orgId: org.id, key: "customer_recovery" });
    const row = (await getOrganizationBlueprints(org.id)).find((b) => b.key === "customer_recovery")!;
    expect(row.overlaps).toEqual([]); // sin plantilla instalada, sin aviso

    await prisma.templateInstallation.create({ data: { organizationId: org.id, templateId: tpl.id, versionId: tpl.versions[0].id, status: "ACTIVE" } });
    const withOverlap = (await getOrganizationBlueprints(org.id)).find((b) => b.key === "customer_recovery")!;
    expect(withOverlap.overlaps).toEqual([{ templateName: "Retención de Membresías — Gimnasio", category: "retention" }]);
    // Otra categoría no se ve afectada.
    expect((await getOrganizationBlueprints(org.id)).find((b) => b.key === "post_visit_feedback")!.overlaps).toEqual([]);

    const automation = await prisma.automation.findFirstOrThrow({ where: { organizationId: org.id, blueprintKey: "customer_recovery" } });
    await expect(setBlueprintDryRun({ orgId: org.id, automationId: automation.id, dryRun: false })).rejects.toThrow(/plantilla de n8n parecida/);
    expect((await prisma.automation.findUniqueOrThrow({ where: { id: automation.id } })).dryRun).toBe(true);
    await setBlueprintDryRun({ orgId: org.id, automationId: automation.id, dryRun: false, acknowledgeOverlap: true });
    expect((await prisma.automation.findUniqueOrThrow({ where: { id: automation.id } })).dryRun).toBe(false);

    // Una plantilla desinstalada ya no cuenta.
    await prisma.templateInstallation.updateMany({ where: { organizationId: org.id }, data: { status: "UNINSTALLED" } });
    expect((await getOrganizationBlueprints(org.id)).find((b) => b.key === "customer_recovery")!.overlaps).toEqual([]);
  });
});

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

    const row = (await getOrganizationBlueprints(org.id)).find(b => b.key === "welcome_new_customer")!;
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
