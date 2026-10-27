// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { saveProperty, saveProspect, type PropertyInput } from "./service";

const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { sent: true })) }));
vi.mock("./postal", () => ({
  isPostalCode: (cp: string) => /^\d{5}$/.test(cp),
  lookupPostalCode: async (cp: string) => {
    if (cp === "22222") return { cp, estado: "Nuevo León", municipio: "Monterrey", ciudad: null, colonias: [{ nombre: "Norte Uno", tipo: "Colonia" }, { nombre: "Norte Dos", tipo: "Colonia" }] };
    if (cp === "11111") return { cp, estado: "Nuevo León", municipio: "Monterrey", ciudad: null, colonias: ["A", "B", "C", "D", "E"].map((n) => ({ nombre: `Colonia ${n}`, tipo: "Colonia" })) };
    return null;
  },
}));

import { InquiryError, submitInquiry } from "./inquiry";

const ctx = { ip: "203.0.113.5", userAgent: "vitest" };

async function realtyOrg(prefix: string, withModule = true) {
  const org = await createTestOrg(prefix);
  if (withModule) await prisma.organizationModule.create({ data: { organizationId: org.id, module: "REALTY", status: "ACTIVE", source: "SUBSCRIBED" } });
  const advisor = await createTestUser(org.id, "AGENT", `${prefix.toLowerCase()}-advisor`);
  return { org, advisor };
}

const property = (zoneId: string, advisorUserId: string | null, over: Partial<PropertyInput> = {}): PropertyInput => ({
  title: "Casa en Cumbres",
  description: null,
  operation: "SALE",
  propertyType: "HOUSE",
  status: "AVAILABLE",
  price: 4_200_000,
  currency: "MXN",
  zoneId,
  postalCode: "64610",
  neighborhood: "Cumbres",
  municipality: "Monterrey",
  state: "Nuevo León",
  addressLine: null,
  showExactLocation: false,
  latitude: null,
  longitude: null,
  bedrooms: 3,
  bathrooms: 2,
  parkingSpaces: 2,
  constructionArea: 200,
  landArea: 180,
  ageYears: 5,
  furnished: null,
  features: [],
  contactWhatsapp: null,
  branchId: null,
  advisorUserId,
  published: true,
  ...over,
});

let A: Awaited<ReturnType<typeof realtyOrg>>;
let NoModule: Awaited<ReturnType<typeof realtyOrg>>;
let slugA = "";
let slugA2 = "";
let slugRent = "";
let slugSold = "";
let slugNoModule = "";

const body = (slug: string, over: Record<string, unknown> = {}) => ({
  slug,
  name: "Laura Interesada",
  phone: "81 1234 5678",
  operation: "SALE",
  propertyType: "HOUSE",
  maxBudget: 4_500_000,
  place: "Cumbres",
  consent: true,
  ...over,
});

async function slugOf(propertyId: string) {
  return (await prisma.realtyProperty.findUniqueOrThrow({ where: { id: propertyId }, select: { slug: true } })).slug;
}

async function cleanRealty(orgId: string) {
  await prisma.realtyPropertyEvent.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyMatch.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyLeadProfile.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyPropertyStatusHistory.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyProperty.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyZone.deleteMany({ where: { organizationId: orgId } });
}

beforeAll(async () => {
  A = await realtyOrg("InqA");
  NoModule = await realtyOrg("InqNoMod", false);
  const zoneA = await prisma.realtyZone.create({ data: { organizationId: A.org.id, name: "Seed", key: "seed" } });
  slugA = await slugOf(await saveProperty(A.org.id, A.advisor.id, property(zoneA.id, A.advisor.id)));
  slugA2 = await slugOf(await saveProperty(A.org.id, A.advisor.id, property(zoneA.id, A.advisor.id, { title: "Casa en Valle", neighborhood: "Valle Poniente", postalCode: "66000", price: 3_000_000 })));
  slugRent = await slugOf(await saveProperty(A.org.id, A.advisor.id, property(zoneA.id, null, { title: "Depa en renta", operation: "RENT", propertyType: "APARTMENT", price: 18_000 })));
  slugSold = await slugOf(await saveProperty(A.org.id, A.advisor.id, property(zoneA.id, A.advisor.id, { title: "Casa vendida", status: "SOLD" })));
  const zoneN = await prisma.realtyZone.create({ data: { organizationId: NoModule.org.id, name: "Seed", key: "seed" } });
  slugNoModule = await slugOf(await saveProperty(NoModule.org.id, NoModule.advisor.id, property(zoneN.id, null)));
});

beforeEach(() => {
  sent.length = 0;
});

afterAll(async () => {
  for (const o of [A, NoModule]) {
    if (!o) continue;
    await cleanRealty(o.org.id);
    await cleanupOrg(o.org.id);
  }
});

describe("formulario «Quiero informes» → Lead + perfil de búsqueda", () => {
  it("crea el Lead del CRM y el perfil con los 5 datos, la propiedad de origen y el consentimiento", async () => {
    const r = await submitInquiry(body(slugA, { src: "SmartCard!", maxBudget: "4,500,000".replace(/,/g, "") }), ctx);
    expect(r.saved).toBe(true);
    if (!r.saved) return;
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId } });
    expect(lead).toMatchObject({ organizationId: A.org.id, name: "Laura Interesada", phone: "+528112345678", phoneKey: "8112345678", assignedTo: A.advisor.id });
    expect(lead.tags).toContain("realty");
    const profile = await prisma.realtyLeadProfile.findUniqueOrThrow({ where: { id: r.profileId }, include: { zones: { include: { zone: true } } } });
    expect(profile).toMatchObject({ organizationId: A.org.id, leadId: r.leadId, operation: "SALE", propertyType: "HOUSE", currency: "MXN", active: true, advisorUserId: A.advisor.id, source: "landing:smartcard", consentVersion: "2026-10" });
    expect(Number(profile.maxBudget)).toBe(4_500_000);
    expect(profile.sourcePropertyId).toBeTruthy();
    expect(profile.consentAt).toBeInstanceOf(Date);
    // La colonia escrita es la de la propiedad: cae en su misma zona (CP 64610), sin crear otra.
    expect(profile.zones).toHaveLength(1);
    expect(profile.zones[0].zone.name).toBe("Cumbres");
    expect(profile.zones[0].zone.postalCode).toBe("64610");
  });

  it("cuenta el evento INQUIRY en la propiedad y avisa por correo al asesor", async () => {
    await submitInquiry(body(slugA, { name: "Otra Persona", phone: "8199990000" }), ctx);
    const p = await prisma.realtyProperty.findFirstOrThrow({ where: { slug: slugA }, select: { id: true } });
    expect(await prisma.realtyPropertyEvent.count({ where: { propertyId: p.id, type: "INQUIRY" } })).toBeGreaterThanOrEqual(1);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(A.advisor.email);
    expect(sent[0].subject).toContain("Otra Persona");
  });

  it("sin asesor en la propiedad, avisa a quien administra el negocio", async () => {
    const owner = await createTestUser(A.org.id, "OWNER", "inq-owner");
    await submitInquiry(body(slugRent, { operation: "RENT", propertyType: "APARTMENT", maxBudget: 20_000, phone: "8100001111" }), ctx);
    expect(sent.map((m) => m.to)).toContain(owner.email);
    expect(sent.map((m) => m.to)).not.toContain(A.advisor.email);
  });

  it("el mismo teléfono en otra propiedad no duplica el contacto ni la demanda: actualiza el perfil y suma zonas", async () => {
    const phone = "8155550000";
    const first = await submitInquiry(body(slugA, { phone, maxBudget: 4_500_000 }), ctx);
    // Un asesor completó datos a mano.
    if (first.saved) await prisma.realtyLeadProfile.update({ where: { id: first.profileId }, data: { minBedrooms: 4, preferences: ["garden"] } });
    const second = await submitInquiry(body(slugA2, { phone, maxBudget: 3_200_000, place: "Valle Poniente" }), ctx);
    expect(first.saved && second.saved).toBe(true);
    if (!first.saved || !second.saved) return;
    expect(second.leadId).toBe(first.leadId);
    expect(second.profileId).toBe(first.profileId);
    expect(await prisma.lead.count({ where: { organizationId: A.org.id, phoneKey: "8155550000" } })).toBe(1);
    const profile = await prisma.realtyLeadProfile.findUniqueOrThrow({ where: { id: first.profileId }, include: { zones: { orderBy: { priority: "asc" }, include: { zone: true } } } });
    expect(Number(profile.maxBudget)).toBe(3_200_000);
    expect(profile.minBedrooms).toBe(4);
    expect(profile.preferences).toEqual(["garden"]);
    expect(profile.zones.map((z) => z.zone.name)).toEqual(["Valle Poniente", "Cumbres"]);
  });

  it("otra operación del mismo contacto es otro perfil", async () => {
    const phone = "8177770000";
    const buy = await submitInquiry(body(slugA, { phone }), ctx);
    const rent = await submitInquiry(body(slugRent, { phone, operation: "RENT", propertyType: "APARTMENT", maxBudget: 20_000 }), ctx);
    expect(buy.saved && rent.saved).toBe(true);
    if (buy.saved && rent.saved) expect(rent.profileId).not.toBe(buy.profileId);
  });

  it("código postal: usa las zonas que la organización ya tiene en ese CP", async () => {
    const r = await submitInquiry(body(slugA, { phone: "8100002222", place: "64610" }), ctx);
    expect(r.saved).toBe(true);
    if (!r.saved) return;
    const zones = await prisma.realtyLeadZone.findMany({ where: { profileId: r.profileId }, include: { zone: true } });
    expect(zones.length).toBeGreaterThanOrEqual(1);
    expect(zones.every((z) => z.zone.postalCode === "64610")).toBe(true);
  });

  it("código postal nuevo con pocas colonias: crea sus zonas; con muchas o inexistente, pide la colonia", async () => {
    const r = await submitInquiry(body(slugA, { phone: "8100003333", place: "22222" }), ctx);
    expect(r.saved).toBe(true);
    if (r.saved) {
      const names = (await prisma.realtyLeadZone.findMany({ where: { profileId: r.profileId }, include: { zone: true } })).map((z) => z.zone.name).sort();
      expect(names).toEqual(["Norte Dos", "Norte Uno"]);
    }
    await expect(submitInquiry(body(slugA, { phone: "8100004444", place: "11111" }), ctx)).rejects.toMatchObject({ code: "postal_ambiguous" });
    await expect(submitInquiry(body(slugA, { phone: "8100005555", place: "00000" }), ctx)).rejects.toMatchObject({ code: "postal_not_found" });
  });

  it("rechaza teléfono inválido, propiedad vendida y organización sin el módulo", async () => {
    await expect(submitInquiry(body(slugA, { phone: "12345678" }), ctx)).rejects.toMatchObject({ code: "phone_invalid" });
    await expect(submitInquiry(body(slugSold), ctx)).rejects.toBeInstanceOf(InquiryError);
    await expect(submitInquiry(body(slugSold), ctx)).rejects.toMatchObject({ code: "unavailable" });
    await expect(submitInquiry(body(slugNoModule), ctx)).rejects.toMatchObject({ code: "unavailable" });
    await expect(submitInquiry(body("no-existe"), ctx)).rejects.toMatchObject({ code: "unavailable" });
  });

  it("exige consentimiento y presupuesto positivo", async () => {
    await expect(submitInquiry(body(slugA, { consent: false }), ctx)).rejects.toThrow();
    await expect(submitInquiry(body(slugA, { maxBudget: 0 }), ctx)).rejects.toThrow();
  });

  it("la organización sale de la propiedad: nada se crea en otra organización", async () => {
    await submitInquiry(body(slugA, { phone: "8100006666" }), ctx);
    expect(await prisma.lead.count({ where: { organizationId: NoModule.org.id } })).toBe(0);
    expect(await prisma.realtyLeadProfile.count({ where: { organizationId: NoModule.org.id } })).toBe(0);
  });

  it("no pisa el perfil capturado a mano por un asesor de otra operación", async () => {
    const manual = await saveProspect(A.org.id, A.advisor.id, {
      contact: { name: "Manual", phone: "8100007777" },
      operation: "SALE", propertyType: "APARTMENT", minBudget: null, maxBudget: 2_000_000, currency: "MXN",
      minBedrooms: 2, minBathrooms: null, minArea: null, moveTimeline: null, financingNeeded: null, preferences: [],
      zoneIds: [], branchId: null, advisorUserId: null, active: true, source: "manual",
    });
    const r = await submitInquiry(body(slugRent, { phone: "8100007777", operation: "RENT", propertyType: "APARTMENT", maxBudget: 20_000 }), ctx);
    expect(r.saved).toBe(true);
    const still = await prisma.realtyLeadProfile.findUniqueOrThrow({ where: { id: manual } });
    expect(still.source).toBe("manual");
    expect(Number(still.maxBudget)).toBe(2_000_000);
  });
});
