// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";
import { applyTemplateInstall } from "@/lib/template-install";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
  isAdmin: (role: string) => role === "SUPER_ADMIN" || role === "ADMIN",
}));

const { enableBlueprint } = await import("./blueprints");
const { getAutomationConfigForm, saveAutomationConfig } = await import("./automation-config");
const { addTemplateVersion } = await import("./templates");

describe("configuración por cliente (blueprints)", () => {
  let org: { id: string };
  let other: { id: string };
  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
    if (other) await cleanupOrg(other.id);
  });
  const admin = () => authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
  const setup = async () => {
    admin();
    org = await createTestOrg("Blueprint Config Org");
    other = await createTestOrg("Blueprint Config Other");
    for (const o of [org, other]) {
      for (const mod of ["FOOD_OPS", "REYMEN_POS"] as const) await prisma.organizationModule.create({ data: { organizationId: o.id, module: mod, status: "ACTIVE", source: "ADMIN_GRANTED" } });
      await enableBlueprint({ orgId: o.id, key: "customer_recovery" });
    }
  };
  const idOf = async (orgId: string, key: string) => (await prisma.automation.findFirstOrThrow({ where: { organizationId: orgId, blueprintKey: key } })).id;
  const stored = (orgId: string) => prisma.automation.findFirstOrThrow({ where: { organizationId: orgId, blueprintKey: "customer_recovery" } });

  it("solo un admin puede ver o cambiar la configuración", async () => {
    authMock.mockResolvedValue(fakeSession({ id: "u1", role: "OWNER", organizationId: null }));
    await expect(getAutomationConfigForm({ orgId: "x", automationId: "y" })).rejects.toThrow(/autorizado/i);
    await expect(saveAutomationConfig({ orgId: "x", automationId: "y", config: {} })).rejects.toThrow(/autorizado/i);
  });

  it("el formulario trae los campos, los valores actuales y la zona horaria del negocio", async () => {
    await setup();
    const form = await getAutomationConfigForm({ orgId: org.id, automationId: await idOf(org.id, "customer_recovery") });
    expect(form).toMatchObject({ kind: "blueprint", name: "Recuperación de clientes", timezone: "America/Mexico_City", live: false });
    expect(form.values).toMatchObject({ minVisits: 3, factor: 2.5, channel: "whatsapp" });
    expect(form.fields.length).toBe(9);
  });

  it("guarda solo lo válido, deja en la bitácora qué cambió y no toca a otro cliente", async () => {
    await setup();
    const res = await saveAutomationConfig({ orgId: org.id, automationId: await idOf(org.id, "customer_recovery"), config: { minVisits: 5, cooldownDays: 45, inventado: "x" } });
    expect(res).toEqual({ success: true, changed: ["minVisits", "cooldownDays"] });
    expect((await stored(org.id)).config).toMatchObject({ minVisits: 5, cooldownDays: 45, factor: 2.5 });
    expect((await stored(org.id)).config).not.toHaveProperty("inventado");
    expect((await stored(other.id)).config).toMatchObject({ minVisits: 3, cooldownDays: 60 }); // otro cliente intacto
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { organizationId: org.id, action: "automation.config" } });
    expect(audit.metadata).toMatchObject({ key: "customer_recovery", changes: { minVisits: { from: 3, to: 5 }, cooldownDays: { from: 60, to: 45 } } });
    // Guardar lo mismo no cambia ni audita de nuevo.
    expect(await saveAutomationConfig({ orgId: org.id, automationId: await idOf(org.id, "customer_recovery"), config: { minVisits: 5 } })).toEqual({ success: true, changed: [] });
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "automation.config" } })).toBe(1);
  });

  it("rechaza fuera de límites, no enteros, opciones inexistentes e incoherencias, sin guardar nada", async () => {
    await setup();
    const res = await saveAutomationConfig({ orgId: org.id, automationId: await idOf(org.id, "customer_recovery"), config: { minVisits: 1, factor: 99, channel: "fax", quietStart: 30 } });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.errors.minVisits).toMatchObject({ code: "too_small", min: 2 });
      expect(res.errors.factor).toMatchObject({ code: "too_big", max: 10 });
      expect(res.errors.channel).toMatchObject({ code: "invalid" });
      expect(res.errors.quietStart).toMatchObject({ code: "too_big", max: 23 });
    }
    const incoherent = await saveAutomationConfig({ orgId: org.id, automationId: await idOf(org.id, "customer_recovery"), config: { minDays: 200, maxDays: 100 } });
    expect(incoherent).toEqual({ success: false, errors: { minDays: { code: "must_be_less", other: "maxDays" } } });
    expect((await stored(org.id)).config).toMatchObject({ minVisits: 3, factor: 2.5, minDays: 21, maxDays: 180 });
  });

  it("avisos por WhatsApp: exige un número internacional válido", async () => {
    admin();
    org = await createTestOrg("Blueprint Notify Org");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "FOOD_OPS", status: "ACTIVE", source: "ADMIN_GRANTED" } });
    await enableBlueprint({ orgId: org.id, key: "inventory_low_alert" });
    expect(await saveAutomationConfig({ orgId: org.id, automationId: await idOf(org.id, "inventory_low_alert"), config: { notify: "whatsapp" } })).toEqual({ success: false, errors: { whatsappTo: { code: "required" } } });
    const bad = await saveAutomationConfig({ orgId: org.id, automationId: await idOf(org.id, "inventory_low_alert"), config: { notify: "email_whatsapp", whatsappTo: "5512345678" } });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(bad.errors.whatsappTo).toMatchObject({ code: "invalid" });
    expect(await saveAutomationConfig({ orgId: org.id, automationId: await idOf(org.id, "inventory_low_alert"), config: { notify: "email_whatsapp", whatsappTo: "+5215512345678" } })).toMatchObject({ success: true, changed: ["notify", "whatsappTo"] });
    // Solo la campana no necesita número.
    expect(await saveAutomationConfig({ orgId: org.id, automationId: await idOf(org.id, "inventory_low_alert"), config: { notify: "app" } })).toMatchObject({ success: true });
  });

  it("una automatización de otro cliente o inexistente no se puede configurar", async () => {
    await setup();
    await expect(saveAutomationConfig({ orgId: org.id, automationId: await idOf(other.id, "customer_recovery"), config: { minVisits: 5 } })).rejects.toThrow(/no encontrada/i);
    await expect(getAutomationConfigForm({ orgId: org.id, automationId: "no-existe" })).rejects.toThrow(/no encontrada/i);
  });
});


const SPEC = {
  reviewUrl: { kind: "url", group: "extras", label: { es: "Enlace de reseñas", en: "Review link" }, help: { es: "A dónde se manda al cliente satisfecho.", en: "Where a happy customer is sent." }, ownerEditable: true },
  channel: { kind: "select", group: "channel", label: { es: "Canal", en: "Channel" }, help: { es: "Por dónde responde.", en: "How it replies." }, options: { whatsapp: { es: "WhatsApp", en: "WhatsApp" }, sms: { es: "SMS", en: "SMS" } }, default: "whatsapp" },
  openHour: { kind: "hour", group: "when", label: { es: "Abre a las", en: "Opens at" }, help: { es: "Hora local.", en: "Local time." }, default: 9 },
  maxPerDay: { kind: "number", group: "limits", integer: true, min: 1, max: 50, default: 5, label: { es: "Máximo por día", en: "Max per day" }, help: { es: "Tope diario.", en: "Daily cap." }, unit: { es: "mensajes", en: "messages" } },
  contact: { kind: "phone", group: "who", required: true, label: { es: "Responsable", en: "Owner" }, help: { es: "A quién avisar.", en: "Who to notify." } },
};

describe("configuración por cliente (plantillas n8n con parámetros declarados)", () => {
  let org: { id: string };
  let other: { id: string };
  let templateId: string;
  afterEach(async () => {
    for (const o of [org, other]) if (o) { await prisma.templateInstallation.deleteMany({ where: { organizationId: o.id } }); await cleanupOrg(o.id); }
    if (templateId) {
      await prisma.templateVersion.deleteMany({ where: { templateId } });
      await prisma.automationTemplate.delete({ where: { id: templateId } });
    }
  });
  const admin = () => authMock.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
  const setup = async (spec: Record<string, unknown> | undefined = SPEC) => {
    admin();
    org = await createTestOrg("Template Config Org");
    other = await createTestOrg("Template Config Other");
    const tpl = await prisma.automationTemplate.create({ data: { name: "Reseñas genérico", description: "Pide reseñas a clientes satisfechos", industry: "clinic", category: "lead_capture", isPublished: true } });
    templateId = tpl.id;
    await addTemplateVersion(tpl.id, { version: "1.0.0", n8nWorkflowJson: { nodes: [] }, configSpec: spec });
    const version = await prisma.templateVersion.findFirstOrThrow({ where: { templateId } });
    const install = (orgId: string, config?: Record<string, unknown>) => applyTemplateInstall({ orgId, userId: "u", templateId, template: tpl, version, config });
    return { install };
  };

  it("la versión declara sus parámetros: la declaración se valida al crearla", async () => {
    admin();
    const tpl = await prisma.automationTemplate.create({ data: { name: "T", description: "descripción larga", industry: "clinic", category: "crm" } });
    templateId = tpl.id;
    await expect(addTemplateVersion(tpl.id, { version: "1.0.0", n8nWorkflowJson: {}, configSpec: { x: { kind: "select", group: "when", label: { es: "a", en: "a" }, help: { es: "a", en: "a" } } } })).rejects.toThrow(/no válidos/i);
    await expect(addTemplateVersion(tpl.id, { version: "1.0.0", n8nWorkflowJson: {}, configSpec: { "mala llave": SPEC.openHour } })).rejects.toThrow(/no válidos/i);
    await expect(addTemplateVersion(tpl.id, { version: "1.0.0", n8nWorkflowJson: {}, configSpec: { n: { ...SPEC.maxPerDay, default: 99 } } })).rejects.toThrow(/no válidos/i);
    expect(await prisma.templateVersion.count({ where: { templateId } })).toBe(0);
  });

  it("al instalar, la config se completa con los valores de fábrica y vive SOLO en Automation.config", async () => {
    const { install } = await setup();
    const { automationId } = await install(org.id, { channel: "sms" });
    const auto = await prisma.automation.findUniqueOrThrow({ where: { id: automationId } });
    expect(auto.config).toMatchObject({ channel: "sms", openHour: 9, maxPerDay: 5 });
    await expect(install(other.id, { maxPerDay: 500 })).rejects.toThrow(/parámetros/i);
  });

  it("la misma pantalla de blueprints: campos, valores, errores por campo, obligatorios y bitácora", async () => {
    const { install } = await setup();
    const { automationId } = await install(org.id);
    const form = await getAutomationConfigForm({ orgId: org.id, automationId });
    expect(form).toMatchObject({ kind: "template", name: "Reseñas genérico", version: "1.0.0", live: true });
    expect(form.fields.map((f) => f.key)).toEqual(["openHour", "contact", "channel", "reviewUrl", "maxPerDay"].sort((a, b) => 0) && expect.arrayContaining(["openHour", "contact", "channel", "reviewUrl", "maxPerDay"]));
    expect(form.fields.find((f) => f.key === "reviewUrl")).toMatchObject({ ownerEditable: true, kind: "url" });
    expect(form.fields.find((f) => f.key === "maxPerDay")).toMatchObject({ min: 1, max: 50, defaultValue: 5 });
    expect(form.values).toMatchObject({ channel: "whatsapp", openHour: 9, maxPerDay: 5 });

    const bad = await saveAutomationConfig({ orgId: org.id, automationId, config: { maxPerDay: 99, channel: "fax", reviewUrl: "no es url", openHour: 30 } });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.errors.maxPerDay).toMatchObject({ code: "too_big", max: 50 });
      expect(bad.errors.channel).toMatchObject({ code: "invalid" });
      expect(bad.errors.reviewUrl).toMatchObject({ code: "invalid" });
      expect(bad.errors.openHour).toMatchObject({ code: "too_big", max: 23 });
    }
    expect(await saveAutomationConfig({ orgId: org.id, automationId, config: { maxPerDay: 10 } })).toEqual({ success: false, errors: { contact: { code: "required" } } });
    expect(await saveAutomationConfig({ orgId: org.id, automationId, config: { maxPerDay: 10, contact: "+5215512345678", reviewUrl: "https://g.page/r/abc" } })).toEqual({ success: true, changed: expect.arrayContaining(["maxPerDay", "contact", "reviewUrl"]) });
    expect((await prisma.automation.findUniqueOrThrow({ where: { id: automationId } })).config).toMatchObject({ maxPerDay: 10, contact: "+5215512345678", reviewUrl: "https://g.page/r/abc", channel: "whatsapp" });
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "automation.config" } })).toBe(1);
  });

  it("aislamiento: otro cliente no ve ni cambia la config; una plantilla sin parámetros declarados no tiene pantalla", async () => {
    const { install } = await setup();
    const { automationId } = await install(org.id);
    await expect(getAutomationConfigForm({ orgId: other.id, automationId })).rejects.toThrow(/no encontrada/i);
    await expect(saveAutomationConfig({ orgId: other.id, automationId, config: { maxPerDay: 3 } })).rejects.toThrow(/no encontrada/i);
    await prisma.templateVersion.updateMany({ where: { templateId }, data: { configSpec: undefined } });
    await prisma.templateVersion.updateMany({ where: { templateId }, data: { configSpec: { not: "valid" } } });
    await expect(getAutomationConfigForm({ orgId: org.id, automationId })).rejects.toThrow(/no tiene parámetros/i);
  });
});
