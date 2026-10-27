// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { getLeadSearchViews, sourceLabel } from "./lead-profile";

let withModule: { id: string };
let withoutModule: { id: string };
let leadId = "";
let propertyId = "";

beforeAll(async () => {
  withModule = await createTestOrg("LeadProfile");
  withoutModule = await createTestOrg("LeadProfileNoMod");
  await prisma.organizationModule.create({ data: { organizationId: withModule.id, module: "REALTY", status: "ACTIVE", source: "SUBSCRIBED" } });
  const advisor = await createTestUser(withModule.id, "AGENT", "lp-advisor");
  const zoneA = await prisma.realtyZone.create({ data: { organizationId: withModule.id, name: "Cumbres", key: "cumbres" } });
  const zoneB = await prisma.realtyZone.create({ data: { organizationId: withModule.id, name: "Valle Poniente", key: "valle-poniente" } });
  const prop = await prisma.realtyProperty.create({
    data: { organizationId: withModule.id, slug: `lp-${Date.now()}`, title: "Casa origen", operation: "SALE", propertyType: "HOUSE", price: 4_000_000, zoneId: zoneA.id },
  });
  propertyId = prop.id;
  const lead = await prisma.lead.create({ data: { organizationId: withModule.id, name: "Ana Busca", phone: "+528100000000" } });
  leadId = lead.id;
  // Perfil viejo e inactivo, y uno activo más reciente.
  await prisma.realtyLeadProfile.create({ data: { organizationId: withModule.id, leadId, operation: "RENT", propertyType: "APARTMENT", maxBudget: 20_000, active: false, source: "manual", createdAt: new Date("2026-01-01") } });
  const active = await prisma.realtyLeadProfile.create({
    data: {
      organizationId: withModule.id, leadId, operation: "SALE", propertyType: "HOUSE", minBudget: 3_500_000, maxBudget: 4_500_000, source: "landing:smartcard", sourcePropertyId: propertyId, advisorUserId: advisor.id,
      zones: { create: [{ organizationId: withModule.id, zoneId: zoneB.id, priority: 2 }, { organizationId: withModule.id, zoneId: zoneA.id, priority: 1 }] },
    },
  });
  await prisma.realtyMatch.createMany({ data: [{ organizationId: withModule.id, profileId: active.id, propertyId, totalScore: 82, budgetScore: 100, zoneScore: 100, typeScore: 100, roomsScore: 50, areaScore: 50, extrasScore: 0, calculationVersion: "v1" }] });
});

afterAll(async () => {
  await prisma.realtyMatch.deleteMany({ where: { organizationId: withModule.id } });
  await prisma.realtyLeadProfile.deleteMany({ where: { organizationId: withModule.id } });
  await prisma.realtyProperty.deleteMany({ where: { organizationId: withModule.id } });
  await prisma.realtyZone.deleteMany({ where: { organizationId: withModule.id } });
  await cleanupOrg(withModule.id);
  await cleanupOrg(withoutModule.id);
});

describe("getLeadSearchViews", () => {
  it("devuelve null si la organización no tiene Real Estate", async () => {
    expect(await getLeadSearchViews(withoutModule.id, leadId, "es")).toBeNull();
  });

  it("lista los perfiles del contacto, el activo primero, ya formateados", async () => {
    const views = await getLeadSearchViews(withModule.id, leadId, "es");
    expect(views).toHaveLength(2);
    const [active, old] = views!;
    expect(active).toMatchObject({ active: true, type: expect.stringMatching(/casa/i), zones: ["Cumbres", "Valle Poniente"], source: "Landing · smartcard", bestMatch: 82, sourceProperty: { id: propertyId, title: "Casa origen" } });
    expect(active.budget).toBe("$3.5M–$4.5M");
    expect(active.advisor).toBeTruthy();
    expect(old).toMatchObject({ active: false, budget: "≤ $20k", zones: [], bestMatch: null, source: "Manual" });
  });

  it("respeta el idioma de las etiquetas", async () => {
    const [active] = (await getLeadSearchViews(withModule.id, leadId, "en"))!;
    // Es lo que BUSCA la persona: «Buy», no «Sale» (la operación de una propiedad).
    expect(active.operation).toBe("Buy");
    expect(active.type).toMatch(/house/i);
  });

  it("no mezcla organizaciones: un lead ajeno no muestra perfiles", async () => {
    const other = await prisma.lead.create({ data: { organizationId: withoutModule.id, name: "Ajeno" } });
    expect(await getLeadSearchViews(withModule.id, other.id, "es")).toEqual([]);
  });
});

describe("sourceLabel", () => {
  it("embellece el origen", () => {
    expect(sourceLabel("landing")).toBe("Landing");
    expect(sourceLabel("landing:qr")).toBe("Landing · qr");
    expect(sourceLabel(null)).toBeNull();
    expect(sourceLabel("SmartCard")).toBe("SmartCard");
  });
});
