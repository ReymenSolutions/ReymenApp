// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { saveProperty, saveProspect, scheduleVisit, recordClosing, saveCampaign, type PropertyInput } from "./service";
import { campaignCounts, campaignTrackingUrl, countsOf } from "./campaign-stats";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));

describe("métricas automáticas de campañas", () => {
  let orgId = "";
  let userId = "";
  let campaignId = "";
  let otherCampaignId = "";
  let propertyId = "";

  const prospect = (leadId: string, campaign: string | null) =>
    saveProspect(orgId, userId, { contact: { leadId }, operation: "SALE", propertyType: null, minBudget: null, maxBudget: 3_000_000, currency: "MXN", minBedrooms: null, minBathrooms: null, minArea: null, moveTimeline: null, financingNeeded: null, preferences: [], zoneIds: [], branchId: null, advisorUserId: null, active: true, source: "landing:meta", campaignId: campaign });

  beforeAll(async () => {
    const org = await createTestOrg("CAMP");
    orgId = org.id;
    userId = (await createTestUser(org.id, "OWNER", "camp-owner")).id;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "REALTY", status: "ACTIVE", source: "SUBSCRIBED" } });
    const zone = await prisma.realtyZone.create({ data: { organizationId: org.id, name: "Cumbres", key: "cumbres" } });
    const prop: PropertyInput = { title: "Casa", description: null, operation: "SALE", propertyType: "HOUSE", status: "AVAILABLE", price: 3_000_000, currency: "MXN", zoneId: zone.id, postalCode: null, neighborhood: "Cumbres", municipality: null, state: null, addressLine: null, showExactLocation: false, latitude: null, longitude: null, bedrooms: 3, bathrooms: 2, parkingSpaces: 1, constructionArea: 150, landArea: 200, ageYears: 1, furnished: null, features: [], contactWhatsapp: null, advisorUserId: null, branchId: null, published: true };
    propertyId = await saveProperty(org.id, userId, prop);
    campaignId = await saveCampaign(org.id, userId, { name: "Meta", channel: "META", propertyId, spend: 1000, startDate: new Date(), endDate: null, status: "ACTIVE" });
    otherCampaignId = await saveCampaign(org.id, userId, { name: "Otra", channel: "GOOGLE", propertyId: null, spend: 500, startDate: new Date(), endDate: null, status: "ACTIVE" });
  });
  afterAll(() => cleanupOrg(orgId));

  it("cuenta leads, visitas y cierres de los prospectos de la campaña, sin captura manual", async () => {
    const mk = async (n: string) => (await prisma.lead.create({ data: { organizationId: orgId, name: n } })).id;
    const [a, b, c] = [await mk("A"), await mk("B"), await mk("C")];
    const pa = await prospect(a, campaignId);
    await prospect(b, campaignId);
    await prospect(c, otherCampaignId);

    // Visita ligada al perfil + visita agendada con el mismo contacto desde la landing (sin perfil)
    const start = new Date(Date.now() + 3 * 86_400_000);
    await scheduleVisit(orgId, userId, { propertyId, profileId: pa, leadId: a, advisorUserId: null, startTime: start, durationMinutes: 60, notes: null, description: "v1", source: "realty" });
    await scheduleVisit(orgId, userId, { propertyId, profileId: null, leadId: b, advisorUserId: null, startTime: new Date(start.getTime() + 2 * 3_600_000), durationMinutes: 60, notes: null, description: "v2", source: "realty-landing" });
    await recordClosing(orgId, userId, { propertyId, profileId: pa, advisorUserId: null, opportunityId: null, finalAmount: 2_900_000, commissionAmount: null, closedAt: new Date(), notes: null });

    const counts = await campaignCounts(orgId);
    expect(countsOf(counts, campaignId)).toEqual({ leads: 2, visits: 2, closings: 1, revenue: 2_900_000 });
    expect(countsOf(counts, otherCampaignId)).toMatchObject({ leads: 1, visits: 0, closings: 0 });
    expect(countsOf(counts, "no-existe")).toEqual({ leads: 0, visits: 0, closings: 0, revenue: 0 });
  });

  it("el primer contacto manda: volver con otra campaña no cambia la atribución", async () => {
    const lead = (await prisma.lead.create({ data: { organizationId: orgId, name: "D" } })).id;
    const id = await prospect(lead, campaignId);
    await saveProspect(orgId, userId, { id, contact: { leadId: lead }, operation: "SALE", propertyType: null, minBudget: null, maxBudget: 3_100_000, currency: "MXN", minBedrooms: null, minBathrooms: null, minArea: null, moveTimeline: null, financingNeeded: null, preferences: [], zoneIds: [], branchId: null, advisorUserId: null, active: true, source: "manual" });
    expect((await prisma.realtyLeadProfile.findUniqueOrThrow({ where: { id } })).campaignId).toBe(campaignId);
  });

  it("arma el enlace de seguimiento con canal y campaña", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.reymen.mx");
    expect(campaignTrackingUrl("casa-1", "SMARTCARD", "c123")).toBe("https://app.reymen.mx/p/casa-1?src=smartcard&c=c123");
    vi.unstubAllEnvs();
  });
});
