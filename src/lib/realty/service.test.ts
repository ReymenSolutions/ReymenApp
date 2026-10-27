// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import {
  addPropertyPhotos,
  assertProperty,
  deletePropertyPhoto,
  recordClosing,
  saveCampaign,
  saveProperty,
  saveProspect,
  saveZone,
  scheduleVisit,
  type PropertyInput,
  type ProspectInput,
} from "./service";
import { getProperty, getProspect, listProperties, listProspects, loadSnapshot } from "./queries";
import { getPublicProperty, recordPublicEvent } from "./public";
import { zoneCentroids } from "./zone-geo";

const H = 3_600_000;

async function realtyOrg(prefix: string) {
  const org = await createTestOrg(prefix);
  await prisma.organizationModule.create({ data: { organizationId: org.id, module: "REALTY", status: "ACTIVE", source: "SUBSCRIBED" } });
  const user = await createTestUser(org.id, "AGENT", `${prefix.toLowerCase()}-agent`);
  const zoneId = await saveZone(org.id, user.id, { name: "Cumbres", latitude: 25.73, longitude: -100.4 });
  return { org, user, zoneId };
}

const baseProperty = (zoneId: string, over: Partial<PropertyInput> = {}): PropertyInput => ({
  title: "Casa de prueba en Cumbres",
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
  addressLine: "Calle Secreta 123",
  showExactLocation: false,
  latitude: 25.7311,
  longitude: -100.4022,
  bedrooms: 3,
  bathrooms: 2.5,
  parkingSpaces: 2,
  constructionArea: 200,
  landArea: 180,
  ageYears: 5,
  furnished: null,
  features: ["parking", "garden"],
  contactWhatsapp: null,
  branchId: null,
  advisorUserId: null,
  published: true,
  ...over,
});

const baseProspect = (zoneId: string, over: Partial<ProspectInput> = {}): ProspectInput => ({
  contact: { name: "Ana Prueba", phone: "+52 81 0000 1234", email: null, source: "SmartCard" },
  operation: "SALE",
  propertyType: "HOUSE",
  minBudget: 3_500_000,
  maxBudget: 4_500_000,
  currency: "MXN",
  minBedrooms: 3,
  minBathrooms: 2,
  minArea: 180,
  moveTimeline: null,
  financingNeeded: true,
  preferences: ["parking", "garden"],
  zoneIds: [zoneId],
  branchId: null,
  advisorUserId: null,
  active: true,
  source: "SmartCard",
  ...over,
});

let A: Awaited<ReturnType<typeof realtyOrg>>;
let B: Awaited<ReturnType<typeof realtyOrg>>;
let propertyId: string;
let profileId: string;

async function cleanRealty(orgId: string) {
  await prisma.realtyClosing.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyCampaign.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyMatch.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyLeadProfile.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyPropertyVisit.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyProperty.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyZone.deleteMany({ where: { organizationId: orgId } });
}

beforeAll(async () => {
  A = await realtyOrg("RealtyA");
  B = await realtyOrg("RealtyB");
  propertyId = await saveProperty(A.org.id, A.user.id, baseProperty(A.zoneId));
  profileId = await saveProspect(A.org.id, A.user.id, baseProspect(A.zoneId));
});

afterAll(async () => {
  for (const o of [A, B]) {
    if (!o) continue;
    await cleanRealty(o.org.id);
    await cleanupOrg(o.org.id);
  }
});

describe("prospecto = Lead del CRM (sin duplicar contactos)", () => {
  it("crea el Lead una vez y lo reutiliza por teléfono", async () => {
    const p = await getProspect(A.org.id, profileId);
    expect(p?.lead?.name).toBe("Ana Prueba");
    const again = await saveProspect(A.org.id, A.user.id, baseProspect(A.zoneId, { contact: { name: "Ana P.", phone: "8100001234" }, operation: "RENT", maxBudget: 25_000, minBudget: null }));
    const p2 = await getProspect(A.org.id, again);
    expect(p2?.leadId).toBe(p?.leadId);
    expect(await prisma.lead.count({ where: { organizationId: A.org.id, phoneKey: "8100001234" } })).toBe(1);
  });

  it("calcula y guarda el match con desglose", async () => {
    const m = await prisma.realtyMatch.findUnique({ where: { profileId_propertyId: { profileId, propertyId } } });
    expect(m).toMatchObject({ totalScore: 100, budgetScore: 100, zoneScore: 100, calculationVersion: "v1" });
  });
});

describe("la zona es la colonia", () => {
  let ctx: Awaited<ReturnType<typeof realtyOrg>>;
  beforeAll(async () => {
    ctx = await realtyOrg("ZonaColonia");
  });
  afterAll(async () => {
    await cleanupOrg(ctx.org.id);
  });

  it("asigna (o crea) la zona de la colonia y no usa la que llega del formulario", async () => {
    const id = await saveProperty(ctx.org.id, ctx.user.id, baseProperty(ctx.zoneId, { neighborhood: "Vista Hermosa", postalCode: "64620" }));
    const p = await prisma.realtyProperty.findUniqueOrThrow({ where: { id }, select: { zone: { select: { name: true, postalCode: true } } } });
    expect(p.zone).toEqual({ name: "Vista Hermosa", postalCode: "64620" });
    // Otra propiedad en la misma colonia reusa la zona.
    const id2 = await saveProperty(ctx.org.id, ctx.user.id, baseProperty(ctx.zoneId, { neighborhood: "vista hermosa", postalCode: "64620", title: "Otra casa" }));
    const zones = await prisma.realtyZone.findMany({ where: { organizationId: ctx.org.id, name: { startsWith: "Vista Hermosa" } } });
    expect(zones).toHaveLength(1);
    expect((await prisma.realtyProperty.findUniqueOrThrow({ where: { id: id2 } })).zoneId).toBe(zones[0].id);
  });

  it("colonias con el mismo nombre y otro CP son zonas distintas", async () => {
    await saveProperty(ctx.org.id, ctx.user.id, baseProperty(ctx.zoneId, { neighborhood: "Centro", postalCode: "64000", municipality: "Monterrey" }));
    await saveProperty(ctx.org.id, ctx.user.id, baseProperty(ctx.zoneId, { neighborhood: "Centro", postalCode: "66230", municipality: "San Pedro Garza García", title: "Casa en el centro de SP" }));
    const names = (await prisma.realtyZone.findMany({ where: { organizationId: ctx.org.id, name: { startsWith: "Centro" } }, orderBy: { name: "asc" } })).map((z) => z.name);
    expect(names).toEqual(["Centro", "Centro (San Pedro Garza García)"]);
  });

  it("al cambiar la colonia, la propiedad cambia de zona", async () => {
    const id = await saveProperty(ctx.org.id, ctx.user.id, baseProperty(ctx.zoneId, { neighborhood: "Santa Cecilia", postalCode: "64150" }));
    await saveProperty(ctx.org.id, ctx.user.id, { ...baseProperty(ctx.zoneId, { neighborhood: "Álvaro Obregón", postalCode: "64150" }), id });
    const p = await prisma.realtyProperty.findUniqueOrThrow({ where: { id }, select: { zone: { select: { name: true } } } });
    expect(p.zone.name).toBe("Álvaro Obregón");
  });

  it("una colonia sin punto propio se ubica en el centro aproximado de sus propiedades", async () => {
    const id = await saveProperty(ctx.org.id, ctx.user.id, baseProperty(ctx.zoneId, { neighborhood: "Mitras Centro", postalCode: "64460", latitude: 25.69871, longitude: -100.34432 }));
    const { zoneId } = await prisma.realtyProperty.findUniqueOrThrow({ where: { id } });
    const points = await zoneCentroids(ctx.org.id, [zoneId]);
    // Redondeado a ~1 km: no apunta a la casa.
    expect(points.get(zoneId)).toEqual({ lat: 25.7, lng: -100.34 });
  });

  it("sin colonia no se puede dar de alta", async () => {
    await expect(saveProperty(ctx.org.id, ctx.user.id, baseProperty("", { neighborhood: null }))).rejects.toThrow("Elige la colonia");
  });
});

describe("aislamiento entre organizaciones", () => {
  it("B no puede usar la zona, propiedad ni prospecto de A", async () => {
    // Sin colonia (propiedad de antes) se usaría la zona que llega: la de otra organización se rechaza.
    await expect(saveProperty(B.org.id, B.user.id, baseProperty(A.zoneId, { neighborhood: null }))).rejects.toThrow("Zona no encontrada");
    await expect(assertProperty(B.org.id, propertyId)).rejects.toThrow("Propiedad no encontrada");
    await expect(saveProspect(B.org.id, B.user.id, baseProspect(A.zoneId))).rejects.toThrow("Zona no encontrada");
    await expect(scheduleVisit(B.org.id, B.user.id, { propertyId, profileId: null, advisorUserId: null, startTime: new Date(Date.now() + 48 * H), durationMinutes: 45, notes: null })).rejects.toThrow();
    await expect(scheduleVisit(B.org.id, B.user.id, { propertyId: (await saveProperty(B.org.id, B.user.id, baseProperty(B.zoneId))), profileId, advisorUserId: null, startTime: new Date(Date.now() + 48 * H), durationMinutes: 45, notes: null })).rejects.toThrow("Prospecto no encontrado");
    await expect(saveProperty(B.org.id, B.user.id, baseProperty(B.zoneId, { advisorUserId: A.user.id }))).rejects.toThrow();
    await expect(recordClosing(B.org.id, B.user.id, { propertyId, profileId: null, advisorUserId: null, opportunityId: null, finalAmount: 1, commissionAmount: null, closedAt: new Date(), notes: null })).rejects.toThrow();
  });

  it("las lecturas de B no ven nada de A", async () => {
    expect(await getProperty(B.org.id, propertyId)).toBeNull();
    expect(await getProspect(B.org.id, profileId)).toBeNull();
    expect((await listProspects(B.org.id, { status: "all" })).rows.some((p) => p.id === profileId)).toBe(false);
    expect((await listProperties(B.org.id, {})).rows.some((p) => p.id === propertyId)).toBe(false);
    const snap = await loadSnapshot(B.org.id);
    expect(snap.properties.some((p) => p.id === propertyId)).toBe(false);
    expect(snap.profiles.some((p) => p.id === profileId)).toBe(false);
  });

  it("B no puede borrar fotos de A", async () => {
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#063C82" } }).png().toBuffer();
    await addPropertyPhotos(A.org.id, A.user.id, propertyId, [{ buffer: png, type: "image/png", name: "a.png" }]);
    const media = await prisma.realtyPropertyMedia.findFirstOrThrow({ where: { propertyId } });
    expect(media.mimeType).toBe("image/webp");
    expect(media.width).toBe(40);
    await expect(deletePropertyPhoto(B.org.id, B.user.id, media.id)).rejects.toThrow("Foto no encontrada");
  });
});

describe("visitas y cierres", () => {
  it("la visita es una cita del CRM ligada al Lead y no se empalma en la misma propiedad", async () => {
    const start = new Date(Date.now() + 72 * H);
    const visitId = await scheduleVisit(A.org.id, A.user.id, { propertyId, profileId, advisorUserId: A.user.id, startTime: start, durationMinutes: 60, notes: null });
    const v = await prisma.realtyPropertyVisit.findUniqueOrThrow({ where: { id: visitId }, include: { appointment: true } });
    const p = await getProspect(A.org.id, profileId);
    expect(v.appointment).toMatchObject({ organizationId: A.org.id, source: "realty", leadId: p?.leadId, status: "SCHEDULED" });
    await expect(scheduleVisit(A.org.id, A.user.id, { propertyId, profileId: null, advisorUserId: null, startTime: new Date(start.getTime() + 30 * 60_000), durationMinutes: 45, notes: null })).rejects.toThrow("Ya hay una visita");
  });

  it("el cierre marca vendida con historial, desactiva al prospecto y quita sus matches", async () => {
    const id = await saveProperty(A.org.id, A.user.id, baseProperty(A.zoneId, { title: "Casa para cerrar" }));
    await recordClosing(A.org.id, A.user.id, { propertyId: id, profileId, advisorUserId: null, opportunityId: null, finalAmount: 4_100_000, commissionAmount: 123_000, closedAt: new Date(), notes: null });
    const p = await prisma.realtyProperty.findUniqueOrThrow({ where: { id }, include: { statusHistory: { orderBy: { changedAt: "desc" } } } });
    expect(p.status).toBe("SOLD");
    expect(p.statusHistory[0]).toMatchObject({ fromStatus: "AVAILABLE", toStatus: "SOLD" });
    expect((await prisma.realtyLeadProfile.findUniqueOrThrow({ where: { id: profileId } })).active).toBe(false);
    expect(await prisma.realtyMatch.count({ where: { propertyId: id } })).toBe(0);
    await expect(recordClosing(A.org.id, A.user.id, { propertyId: id, profileId: null, advisorUserId: null, opportunityId: null, finalAmount: 1, commissionAmount: null, closedAt: new Date(), notes: null })).rejects.toThrow("ya tiene un cierre");
  });
});

describe("landing pública", () => {
  it("no expone la dirección exacta y usa la ubicación aproximada de la zona", async () => {
    const p = await prisma.realtyProperty.findUniqueOrThrow({ where: { id: propertyId } });
    const pub = await getPublicProperty(p.slug);
    expect(pub).not.toBeNull();
    expect(pub).not.toHaveProperty("addressLine");
    expect(pub?.location).toEqual({ exact: false, lat: 25.73, lng: -100.4, address: null });
    expect(JSON.stringify(pub)).not.toContain("Calle Secreta");
    expect(JSON.stringify(pub)).not.toContain("advisorUserId");
    expect(JSON.stringify(pub)).not.toContain("@test.local");
  });

  it("cuenta una vista por visitante y día, los clics siempre, y valida la campaña", async () => {
    const p = await prisma.realtyProperty.findUniqueOrThrow({ where: { id: propertyId } });
    const foreign = await saveCampaign(B.org.id, B.user.id, { name: "Ajena", channel: "META", propertyId: null, spend: 100, startDate: new Date(), endDate: null, status: "ACTIVE" });
    const base = { slug: p.slug, source: "SmartCard!", campaignId: foreign, ip: "10.0.0.1", userAgent: "UA" };
    expect(await recordPublicEvent({ ...base, type: "VIEW" })).toEqual({ recorded: true });
    expect(await recordPublicEvent({ ...base, type: "VIEW" })).toMatchObject({ recorded: false, reason: "duplicate" });
    expect(await recordPublicEvent({ ...base, type: "WHATSAPP_CLICK" })).toEqual({ recorded: true });
    expect(await recordPublicEvent({ ...base, type: "WHATSAPP_CLICK" })).toEqual({ recorded: true });
    const rows = await prisma.realtyPropertyEvent.findMany({ where: { propertyId } });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.source === "smartcard" && r.campaignId === null && r.organizationId === A.org.id)).toBe(true);
  });

  it("borradores, inactivas y organizaciones sin el módulo no son públicas", async () => {
    const draft = await saveProperty(A.org.id, A.user.id, baseProperty(A.zoneId, { title: "Borrador", published: false }));
    const d = await prisma.realtyProperty.findUniqueOrThrow({ where: { id: draft } });
    expect(await getPublicProperty(d.slug)).toBeNull();
    expect(await recordPublicEvent({ slug: d.slug, type: "VIEW", source: null, campaignId: null, ip: null, userAgent: null })).toMatchObject({ recorded: false, reason: "not_found" });
    const p = await prisma.realtyProperty.findUniqueOrThrow({ where: { id: propertyId } });
    await prisma.organizationModule.updateMany({ where: { organizationId: A.org.id, module: "REALTY" }, data: { status: "SUSPENDED" } });
    expect(await getPublicProperty(p.slug)).toBeNull();
    await prisma.organizationModule.updateMany({ where: { organizationId: A.org.id, module: "REALTY" }, data: { status: "ACTIVE" } });
  });
});
