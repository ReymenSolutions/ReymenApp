// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { saveProspect } from "./service";

const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { sent: true })) }));
import { acceptProfileSuggestion, listPendingSuggestions, matchZones, parseSuggestion, recordProfileSuggestion, rejectProfileSuggestion, REJECT_COOLDOWN_MS } from "./profile-suggestion";

const full = { operation: "SALE", property_type: "HOUSE", max_budget: "4,500,000", min_budget: 3_500_000, zones: ["Cumbres", " cumbres ", "Narnia"], min_bedrooms: 3, preferences: ["parking", "jacuzzi"], move_timeline: "en 3 meses" };

describe("parseSuggestion", () => {
  it("normaliza lo que dijo el modelo", () => {
    expect(parseSuggestion(full)).toEqual({ operation: "SALE", propertyType: "HOUSE", minBudget: 3_500_000, maxBudget: 4_500_000, zoneNames: ["Cumbres", "cumbres", "Narnia"], minBedrooms: 3, preferences: ["parking"], moveTimeline: "en 3 meses" });
  });
  it("sin operación o sin presupuesto no propone nada", () => {
    expect(parseSuggestion({ ...full, operation: "TRADE" })).toBeNull();
    expect(parseSuggestion({ ...full, max_budget: null })).toBeNull();
    expect(parseSuggestion("hola")).toBeNull();
  });
  it("descarta un mínimo mayor que el máximo y tipos desconocidos", () => {
    expect(parseSuggestion({ ...full, min_budget: 9_000_000, property_type: "CASTLE" })).toMatchObject({ minBudget: null, propertyType: null });
  });
});

describe("matchZones", () => {
  it("empareja sin acentos ni mayúsculas y reporta lo que no existe", () => {
    const zones = [{ id: "z1", name: "San Pedro", key: "san-pedro" }, { id: "z2", name: "Cumbres", key: "cumbres" }];
    expect(matchZones(["san pédro", "CUMBRES", "Narnia", "Cumbres"], zones)).toEqual({ zoneIds: ["z1", "z2"], unmatched: ["Narnia"] });
  });
});

describe("propuestas de perfil (BD)", () => {
  let orgId = "";
  let noModuleId = "";
  let userId = "";
  const leads: string[] = [];
  const newLead = async (org = orgId) => {
    const l = await prisma.lead.create({ data: { organizationId: org, name: `Lead ${leads.length}` } });
    leads.push(l.id);
    return l.id;
  };

  beforeAll(async () => {
    const org = await createTestOrg("SUGA");
    orgId = org.id;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "REALTY", status: "ACTIVE", source: "SUBSCRIBED" } });
    userId = (await createTestUser(org.id, "AGENT", "suga-agent")).id;
    await prisma.realtyZone.create({ data: { organizationId: org.id, name: "Cumbres", key: "cumbres" } });
    noModuleId = (await createTestOrg("SUGB")).id;
  });
  afterAll(async () => {
    await cleanupOrg(orgId);
    await cleanupOrg(noModuleId);
  });

  beforeEach(() => {
    sent.length = 0;
  });

  it("avisa por correo al asesor del contacto (o a quien administra si no tiene)", async () => {
    const owner = await prisma.user.findFirstOrThrow({ where: { id: userId }, select: { email: true } });
    const withAdvisor = await prisma.lead.create({ data: { organizationId: orgId, name: "Con asesor", assignedTo: userId } });
    leads.push(withAdvisor.id);
    await recordProfileSuggestion(orgId, { leadId: withAdvisor.id, messageId: "m", reason: "r", raw: full });
    expect(sent).toEqual([{ to: owner.email, subject: "La IA propone un perfil para Con asesor" }]);
    sent.length = 0;
    await recordProfileSuggestion(orgId, { leadId: withAdvisor.id, messageId: "m2", reason: "r", raw: full });
    expect(sent).toEqual([]); // ya había una pendiente: no se repite el aviso
  });

  it("propone una vez, sin duplicar mientras haya una pendiente", async () => {
    const leadId = await newLead();
    expect(await recordProfileSuggestion(orgId, { leadId, messageId: "m1", reason: "Busca casa", raw: full })).toBe(true);
    expect(await recordProfileSuggestion(orgId, { leadId, messageId: "m2", reason: "otra vez", raw: full })).toBe(false);
    const [s] = await listPendingSuggestions(orgId, leadId);
    expect(s).toMatchObject({ operation: "SALE", maxBudget: 4_500_000, zoneNames: ["Cumbres", "cumbres", "Narnia"] });
  });

  it("no propone sin el módulo ni con propuesta incompleta", async () => {
    const other = await newLead(noModuleId);
    expect(await recordProfileSuggestion(noModuleId, { leadId: other, messageId: "m", reason: "r", raw: full })).toBe(false);
    const leadId = await newLead();
    expect(await recordProfileSuggestion(orgId, { leadId, messageId: "m", reason: "r", raw: { operation: "SALE" } })).toBe(false);
  });

  it("no propone si el contacto ya tiene perfil activo", async () => {
    const leadId = await newLead();
    await saveProspect(orgId, userId, { contact: { leadId }, operation: "RENT", propertyType: null, minBudget: null, maxBudget: 20000, currency: "MXN", minBedrooms: null, minBathrooms: null, minArea: null, moveTimeline: null, financingNeeded: null, preferences: [], zoneIds: [], branchId: null, advisorUserId: null, active: true, source: "manual" });
    expect(await recordProfileSuggestion(orgId, { leadId, messageId: "m", reason: "r", raw: full })).toBe(false);
  });

  it("aceptar crea el perfil ligado al contacto con las zonas que existen", async () => {
    const leadId = await newLead();
    await recordProfileSuggestion(orgId, { leadId, messageId: "m", reason: "r", raw: full });
    const [s] = await listPendingSuggestions(orgId, leadId);
    const profileId = await acceptProfileSuggestion(orgId, s.id, userId, "MXN");
    const profile = await prisma.realtyLeadProfile.findUnique({ where: { id: profileId }, include: { zones: true } });
    expect(profile).toMatchObject({ leadId, operation: "SALE", source: "ai:conversation", active: true });
    expect(Number(profile!.maxBudget)).toBe(4_500_000);
    expect(profile!.zones).toHaveLength(1);
    expect(await listPendingSuggestions(orgId, leadId)).toEqual([]);
    await expect(acceptProfileSuggestion(orgId, s.id, userId, "MXN")).rejects.toThrow();
  });

  it("descartar bloquea nuevas propuestas durante el periodo de espera", async () => {
    const leadId = await newLead();
    await recordProfileSuggestion(orgId, { leadId, messageId: "m", reason: "r", raw: full });
    const [s] = await listPendingSuggestions(orgId, leadId);
    await rejectProfileSuggestion(orgId, s.id, userId);
    expect(await recordProfileSuggestion(orgId, { leadId, messageId: "m2", reason: "r", raw: full })).toBe(false);
    expect(await recordProfileSuggestion(orgId, { leadId, messageId: "m3", reason: "r", raw: full, now: new Date(Date.now() + REJECT_COOLDOWN_MS + 60_000) })).toBe(true);
  });

  it("crear el perfil a mano resuelve la propuesta pendiente", async () => {
    const leadId = await newLead();
    await recordProfileSuggestion(orgId, { leadId, messageId: "m", reason: "r", raw: full });
    await saveProspect(orgId, userId, { contact: { leadId }, operation: "SALE", propertyType: null, minBudget: null, maxBudget: 4_000_000, currency: "MXN", minBedrooms: null, minBathrooms: null, minArea: null, moveTimeline: null, financingNeeded: null, preferences: [], zoneIds: [], branchId: null, advisorUserId: null, active: true, source: "manual" });
    expect(await listPendingSuggestions(orgId, leadId)).toEqual([]);
  });

  it("no acepta propuestas de otra organización", async () => {
    const leadId = await newLead();
    await recordProfileSuggestion(orgId, { leadId, messageId: "m", reason: "r", raw: full });
    const [s] = await listPendingSuggestions(orgId, leadId);
    await expect(acceptProfileSuggestion(noModuleId, s.id, userId, "MXN")).rejects.toThrow();
  });
});
