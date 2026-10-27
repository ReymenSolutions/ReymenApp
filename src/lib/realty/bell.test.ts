// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { saveProspect } from "./service";
import { getRealtyBellItems } from "./bell";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));

describe("avisos de Real Estate en la campana", () => {
  let orgId = "";
  let noModuleId = "";
  let me = "";
  let other = "";
  let zoneId = "";

  const profile = async (over: { advisor?: string | null; source?: string; zones?: string[] }) => {
    const lead = await prisma.lead.create({ data: { organizationId: orgId, name: `Lead ${Math.random().toString(36).slice(2, 6)}` } });
    const id = await saveProspect(orgId, null, { contact: { leadId: lead.id }, operation: "SALE", propertyType: null, minBudget: null, maxBudget: 3_000_000, currency: "MXN", minBedrooms: null, minBathrooms: null, minArea: null, moveTimeline: null, financingNeeded: null, preferences: [], zoneIds: over.zones ?? [], branchId: null, advisorUserId: over.advisor ?? null, active: true, source: over.source ?? "manual" });
    return { id, leadId: lead.id };
  };

  beforeAll(async () => {
    const org = await createTestOrg("BELL");
    orgId = org.id;
    noModuleId = (await createTestOrg("BELLB")).id;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "REALTY", status: "ACTIVE", source: "SUBSCRIBED" } });
    me = (await createTestUser(org.id, "AGENT", "bell-me")).id;
    other = (await createTestUser(org.id, "AGENT", "bell-other")).id;
    zoneId = (await prisma.realtyZone.create({ data: { organizationId: org.id, name: "Cumbres", key: "cumbres" } })).id;
  });
  afterAll(async () => {
    await cleanupOrg(orgId);
    await cleanupOrg(noModuleId);
  });

  it("avisa de los interesados de la landing de mi propiedad (o sin asesor), no de los de otro asesor", async () => {
    const mine = await profile({ advisor: me, source: "landing:meta" });
    await profile({ advisor: other, source: "landing" });
    await profile({ advisor: me, source: "manual" });
    const items = (await getRealtyBellItems(orgId, me, "AGENT")).filter((i) => i.type === "realty_inquiry");
    expect(items.map((i) => i.href)).toEqual([`/portal/realty/prospects/${mine.id}`]);
  });

  it("avisa de la propuesta de la IA al asesor del contacto y desaparece al resolverla", async () => {
    const mineLead = await prisma.lead.create({ data: { organizationId: orgId, name: "Mío", assignedTo: me } });
    const otherLead = await prisma.lead.create({ data: { organizationId: orgId, name: "De otro", assignedTo: other } });
    const base = { organizationId: orgId, operation: "SALE" as const, maxBudget: 1_000_000, reason: "r" };
    const s1 = await prisma.realtyProfileSuggestion.create({ data: { ...base, leadId: mineLead.id } });
    await prisma.realtyProfileSuggestion.create({ data: { ...base, leadId: otherLead.id } });
    const ai = async () => (await getRealtyBellItems(orgId, me, "AGENT")).filter((i) => i.type === "realty_ai_profile");
    expect((await ai()).map((i) => i.detail)).toEqual(["Mío"]);
    await prisma.realtyProfileSuggestion.update({ where: { id: s1.id }, data: { status: "REJECTED" } });
    expect(await ai()).toEqual([]);
  });

  it("avisa de demanda sin inventario con 3 prospectos sin match en una zona", async () => {
    await profile({ zones: [zoneId] });
    await profile({ zones: [zoneId] });
    expect((await getRealtyBellItems(orgId, me, "AGENT")).some((i) => i.type === "realty_unmet_demand")).toBe(false);
    await profile({ zones: [zoneId] });
    const items = (await getRealtyBellItems(orgId, me, "AGENT")).filter((i) => i.type === "realty_unmet_demand");
    expect(items).toHaveLength(1);
    expect(items[0].detail).toContain("Cumbres");
  });

  it("sin el módulo o sin permiso de operar Real Estate no hay avisos", async () => {
    expect(await getRealtyBellItems(noModuleId, me, "AGENT")).toEqual([]);
    expect(await getRealtyBellItems(orgId, me, "VIEWER")).toEqual([]);
  });
});
