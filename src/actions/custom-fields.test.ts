// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";
import { MAX_CUSTOM_FIELDS } from "@/lib/custom-fields";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createCustomField, updateCustomField, setCustomFieldActive, updateLeadCustomFields, deleteCustomField, getCustomFieldUsage } = await import("./custom-fields");
const { mergeLeads } = await import("./leads");
const { processLeadEvent } = await import("@/lib/webhook-processors");
const { GET: exportLeads } = await import("@/app/api/portal/leads/export/route");

describe("custom fields", () => {
  let org: { id: string };
  let other: { id: string };
  let owner: { id: string };
  let agent: { id: string };
  let viewer: { id: string };
  let otherOwner: { id: string };

  const as = (u: { id: string }, role: "OWNER" | "AGENT" | "VIEWER", orgId = org.id) => authMock.mockResolvedValue(fakeSession({ id: u.id, role, organizationId: orgId }));

  beforeAll(async () => {
    org = await createTestOrg("Custom Fields Org");
    other = await createTestOrg("Custom Fields Other");
    owner = await createTestUser(org.id, "OWNER", "cf-owner");
    agent = await createTestUser(org.id, "AGENT", "cf-agent");
    viewer = await createTestUser(org.id, "VIEWER", "cf-viewer");
    otherOwner = await createTestUser(other.id, "OWNER", "cf-other-owner");
  });
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [org.id, other.id] } } });
    await prisma.customField.deleteMany({ where: { organizationId: { in: [org.id, other.id] } } });
    await cleanupOrg(org.id);
    await cleanupOrg(other.id);
  });

  it("only people who can manage settings can define fields", async () => {
    as(agent, "AGENT");
    await expect(createCustomField({ label: "Aseguradora", type: "TEXT" })).rejects.toThrow(/autorizado/i);
    as(viewer, "VIEWER");
    await expect(createCustomField({ label: "Aseguradora", type: "TEXT" })).rejects.toThrow(/autorizado/i);
    authMock.mockResolvedValue(null);
    await expect(createCustomField({ label: "Aseguradora", type: "TEXT" })).rejects.toThrow(/autorizado/i);
  });

  it("creates fields with a stable key, validates the input and refuses duplicates", async () => {
    as(owner, "OWNER");
    const { fieldId } = await createCustomField({ label: "  Fecha   de nacimiento ", type: "DATE" });
    const f = await prisma.customField.findUniqueOrThrow({ where: { id: fieldId } });
    expect(f).toMatchObject({ key: "fecha_de_nacimiento", label: "Fecha de nacimiento", type: "DATE", isActive: true });

    await expect(createCustomField({ label: "fecha DE nacimiento", type: "TEXT" })).rejects.toThrow(/mismo nombre|ese nombre/i);
    await expect(createCustomField({ label: "   ", type: "TEXT" })).rejects.toThrow(/nombre del campo/i);
    await expect(createCustomField({ label: "Aseguradora", type: "SELECT", options: " , " })).rejects.toThrow(/al menos una opción/i);

    const sel = await createCustomField({ label: "Aseguradora", type: "SELECT", options: "GNP, AXA,\nmetlife, gnp" });
    expect((await prisma.customField.findUniqueOrThrow({ where: { id: sel.fieldId } })).options).toEqual(["GNP", "AXA", "metlife"]);
    const txt = await createCustomField({ label: "Notas médicas", type: "TEXT", options: "ignorado" });
    expect((await prisma.customField.findUniqueOrThrow({ where: { id: txt.fieldId } })).options).toEqual([]);
  });

  it("renames and edits options but never changes type or key; archiving keeps the data", async () => {
    as(owner, "OWNER");
    const { fieldId } = await createCustomField({ label: "Tratamiento", type: "SELECT", options: "Limpieza, Ortodoncia" });
    await updateCustomField({ fieldId, label: "Tratamiento de interés", options: "Limpieza, Ortodoncia, Implantes" });
    const f = await prisma.customField.findUniqueOrThrow({ where: { id: fieldId } });
    expect(f).toMatchObject({ key: "tratamiento", label: "Tratamiento de interés", type: "SELECT" });
    expect(f.options).toEqual(["Limpieza", "Ortodoncia", "Implantes"]);
    await expect(updateCustomField({ fieldId, options: "" })).rejects.toThrow(/al menos una opción/i);

    const text = await createCustomField({ label: "Empresa", type: "TEXT" });
    await expect(updateCustomField({ fieldId: text.fieldId, options: "a, b" })).rejects.toThrow(/listas/i);

    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Archivado", customFields: { tratamiento: "Limpieza" } } });
    await setCustomFieldActive(fieldId, false);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).customFields).toEqual({ tratamiento: "Limpieza" }); // los datos siguen ahí
    await setCustomFieldActive(fieldId, true);
    expect((await prisma.customField.findUniqueOrThrow({ where: { id: fieldId } })).isActive).toBe(true);
  });

  it("saves a contact's values by type, all or nothing, and respects roles and organizations", async () => {
    as(owner, "OWNER");
    const cOrg = await createTestOrg("Custom Fields Values");
    const cOwner = await createTestUser(cOrg.id, "OWNER", "cf-values-owner");
    const cViewer = await createTestUser(cOrg.id, "VIEWER", "cf-values-viewer");
    const cAgent = await createTestUser(cOrg.id, "AGENT", "cf-values-agent");
    try {
      as(cOwner, "OWNER", cOrg.id);
      await createCustomField({ label: "Edad", type: "NUMBER" });
      await createCustomField({ label: "Aseguradora", type: "SELECT", options: "GNP, AXA" });
      await createCustomField({ label: "Acepta promociones", type: "BOOLEAN" });
      const lead = await prisma.lead.create({ data: { organizationId: cOrg.id, name: "Paciente", customFields: { edad: 30 } } });

      as(cAgent, "AGENT", cOrg.id);
      await updateLeadCustomFields(lead.id, { aseguradora: "axa", acepta_promociones: "true" });
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).customFields).toEqual({ edad: 30, aseguradora: "AXA", acepta_promociones: true });

      // Todo o nada: un valor inválido no guarda ni los válidos y dice cuál es.
      await expect(updateLeadCustomFields(lead.id, { edad: "veinte", aseguradora: "GNP" })).rejects.toThrow(/«Edad»/);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).customFields).toEqual({ edad: 30, aseguradora: "AXA", acepta_promociones: true });

      // Vacío quita el valor; claves desconocidas se ignoran.
      await updateLeadCustomFields(lead.id, { edad: "", clave_inventada: "x" });
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).customFields).toEqual({ aseguradora: "AXA", acepta_promociones: true });

      const log = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: lead.id, action: "lead.custom_fields_update" }, orderBy: { createdAt: "desc" } });
      expect(log.userId).toBe(cAgent.id);

      as(cViewer, "VIEWER", cOrg.id);
      await expect(updateLeadCustomFields(lead.id, { edad: 5 })).rejects.toThrow(/autorizado/i);

      as(otherOwner, "OWNER", other.id);
      await expect(updateLeadCustomFields(lead.id, { edad: 5 })).rejects.toThrow(/no encontrado/i);
    } finally {
      await prisma.auditLog.deleteMany({ where: { organizationId: cOrg.id } });
      await prisma.customField.deleteMany({ where: { organizationId: cOrg.id } });
      await cleanupOrg(cOrg.id);
    }
  });

  it("is limited to MAX_CUSTOM_FIELDS per organization", async () => {
    const lOrg = await createTestOrg("Custom Fields Limit");
    const lOwner = await createTestUser(lOrg.id, "OWNER", "cf-limit-owner");
    try {
      await prisma.customField.createMany({ data: Array.from({ length: MAX_CUSTOM_FIELDS }, (_, i) => ({ organizationId: lOrg.id, key: `c${i}`, label: `Campo ${i}`, type: "TEXT" as const, order: i })) });
      as(lOwner, "OWNER", lOrg.id);
      await expect(createCustomField({ label: "Uno más", type: "TEXT" })).rejects.toThrow(/máximo/i);
    } finally {
      await prisma.customField.deleteMany({ where: { organizationId: lOrg.id } });
      await cleanupOrg(lOrg.id);
    }
  });

  it("the n8n lead webhook fills custom fields (valid ones only) and never overwrites on an existing person", async () => {
    const wOrg = await createTestOrg("Custom Fields Webhook");
    try {
      await prisma.customField.createMany({
        data: [
          { organizationId: wOrg.id, key: "aseguradora", label: "Aseguradora", type: "SELECT", options: ["GNP", "AXA"], order: 0 },
          { organizationId: wOrg.id, key: "edad", label: "Edad", type: "NUMBER", order: 1 },
          { organizationId: wOrg.id, key: "viejo", label: "Viejo", type: "TEXT", order: 2, isActive: false },
        ],
      });
      await processLeadEvent({ name: "Ana", phone: "55 1234 5678", customFields: { aseguradora: "gnp", edad: "mucha", viejo: "x", inventado: "y" } }, wOrg.id);
      const ana = await prisma.lead.findFirstOrThrow({ where: { organizationId: wOrg.id, name: "Ana" } });
      expect(ana.customFields).toEqual({ aseguradora: "GNP" }); // edad inválida, viejo archivado e inventado: ignorados

      // La misma persona llega otra vez: completa lo que falta y no pisa lo capturado.
      await processLeadEvent({ name: "Ana", phone: "+52 1 55 1234 5678", customFields: { aseguradora: "AXA", edad: 41 } }, wOrg.id);
      expect(await prisma.lead.count({ where: { organizationId: wOrg.id } })).toBe(1);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: ana.id } })).customFields).toEqual({ aseguradora: "GNP", edad: 41 });
    } finally {
      await prisma.customField.deleteMany({ where: { organizationId: wOrg.id } });
      await cleanupOrg(wOrg.id);
    }
  });

  it("merging two contacts keeps the survivor's values and fills the gaps from the duplicate", async () => {
    const mOrg = await createTestOrg("Custom Fields Merge");
    const mOwner = await createTestUser(mOrg.id, "OWNER", "cf-merge-owner");
    try {
      as(mOwner, "OWNER", mOrg.id);
      const a = await prisma.lead.create({ data: { organizationId: mOrg.id, name: "A", customFields: { aseguradora: "GNP" } } });
      const b = await prisma.lead.create({ data: { organizationId: mOrg.id, name: "B", customFields: { aseguradora: "AXA", edad: 40 } } });
      await mergeLeads(a.id, b.id);
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.id } })).customFields).toEqual({ aseguradora: "GNP", edad: 40 });
    } finally {
      await prisma.auditLog.deleteMany({ where: { organizationId: mOrg.id } });
      await cleanupOrg(mOrg.id);
    }
  });

  it("the CSV export adds one column per active field, formatted for people", async () => {
    const eOrg = await createTestOrg("Custom Fields Export");
    const eOwner = await createTestUser(eOrg.id, "OWNER", "cf-export-owner");
    try {
      await prisma.customField.createMany({
        data: [
          { organizationId: eOrg.id, key: "aseguradora", label: "Aseguradora", type: "TEXT", order: 0 },
          { organizationId: eOrg.id, key: "acepta", label: "Acepta promociones", type: "BOOLEAN", order: 1 },
          { organizationId: eOrg.id, key: "archivado", label: "Archivado", type: "TEXT", order: 2, isActive: false },
        ],
      });
      await prisma.lead.create({ data: { organizationId: eOrg.id, name: "Exportado", customFields: { aseguradora: "=cmd|calc", acepta: true, archivado: "no debe salir" } } });
      as(eOwner, "OWNER", eOrg.id);
      const csv = await (await exportLeads()).text();
      const [header, row] = csv.split("\n");
      expect(header.endsWith(",Aseguradora,Acepta promociones")).toBe(true);
      expect(header).not.toContain("Archivado");
      expect(row.endsWith(",'=cmd|calc,Sí")).toBe(true); // el valor que parece fórmula va neutralizado
      expect(row).not.toContain("no debe salir");
    } finally {
      await prisma.customField.deleteMany({ where: { organizationId: eOrg.id } });
      await cleanupOrg(eOrg.id);
    }
  });

  describe("eliminar campo", () => {
    it("borra el campo y el dato en cada contacto (solo ese; otras claves y otras organizaciones quedan)", async () => {
      as(owner, "OWNER");
      const { fieldId, key } = await createCustomField({ label: "Campo para borrar", type: "TEXT" });
      const { key: keepKey } = await createCustomField({ label: "Campo que se queda", type: "TEXT" });
      const a = await prisma.lead.create({ data: { organizationId: org.id, name: "Con dato", customFields: { [key]: "x", [keepKey]: "y" } } });
      const b = await prisma.lead.create({ data: { organizationId: org.id, name: "Sin dato", customFields: { [keepKey]: "z" } } });
      const c = await prisma.lead.create({ data: { organizationId: other.id, name: "Otra org", customFields: { [key]: "ajeno" } } });

      expect(await getCustomFieldUsage(fieldId)).toEqual({ contacts: 1 });
      const res = await deleteCustomField(fieldId);
      expect(res).toMatchObject({ success: true, contactsCleared: 1 });

      expect(await prisma.customField.findUnique({ where: { id: fieldId } })).toBeNull();
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.id } })).customFields).toEqual({ [keepKey]: "y" });
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: b.id } })).customFields).toEqual({ [keepKey]: "z" });
      expect((await prisma.lead.findUniqueOrThrow({ where: { id: c.id } })).customFields).toEqual({ [key]: "ajeno" });
      const audit = await prisma.auditLog.findFirst({ where: { organizationId: org.id, action: "custom_field.delete", resourceId: fieldId } });
      expect(audit?.metadata).toMatchObject({ label: "Campo para borrar", contactsCleared: 1 });
    });

    it("también elimina un campo archivado y permite reusar su nombre", async () => {
      as(owner, "OWNER");
      const { fieldId } = await createCustomField({ label: "Archivado y borrado", type: "BOOLEAN" });
      await setCustomFieldActive(fieldId, false);
      await deleteCustomField(fieldId);
      await expect(createCustomField({ label: "Archivado y borrado", type: "TEXT" })).resolves.toMatchObject({ success: true });
    });

    it("solo quien administra la configuración, y solo campos de su organización", async () => {
      as(owner, "OWNER");
      const { fieldId } = await createCustomField({ label: "Solo del dueño", type: "TEXT" });
      as(agent, "AGENT");
      await expect(deleteCustomField(fieldId)).rejects.toThrow(/autorizado/i);
      await expect(getCustomFieldUsage(fieldId)).rejects.toThrow(/autorizado/i);
      as(otherOwner, "OWNER", other.id);
      await expect(deleteCustomField(fieldId)).rejects.toThrow(/no encontrado/i);
      expect(await prisma.customField.findUnique({ where: { id: fieldId } })).not.toBeNull();
    });
  });
});
