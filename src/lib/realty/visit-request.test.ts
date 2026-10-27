// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { UserError } from "@/lib/user-error";
import { saveProperty, type PropertyInput } from "./service";

const sent: { to: string; subject: string }[] = [];
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async (m: { to: string; subject: string }) => (sent.push({ to: m.to, subject: m.subject }), { sent: true })) }));
const adapter = vi.hoisted(() => ({ failWith: null as Error | null }));
vi.mock("./lead-adapter", async (orig) => {
  const real = await orig<typeof import("./lead-adapter")>();
  return { ...real, ensureLeadForProspect: vi.fn(async (...a: Parameters<typeof real.ensureLeadForProspect>) => { if (adapter.failWith) throw adapter.failWith; return real.ensureLeadForProspect(...a); }) };
});

import { getVisitSlots, listVisitSlots, requestVisit } from "./visit-request";

// Lunes 2 de noviembre de 2026, 15:00 UTC = 09:00 en Ciudad de México (UTC-6, sin horario de verano).
const NOW = new Date("2026-11-02T15:00:00Z");
const TUE = "2026-11-03";
const at = (h: number, day = TUE) => new Date(`${day}T${String(h + 6).padStart(2, "0")}:00:00Z`).toISOString(); // hora local de CDMX → UTC

const property = (zoneId: string, advisorUserId: string | null, over: Partial<PropertyInput> = {}): PropertyInput => ({
  title: "Casa visita", description: null, operation: "SALE", propertyType: "HOUSE", status: "AVAILABLE", price: 3_000_000, currency: "MXN", zoneId,
  postalCode: "64610", neighborhood: "Cumbres", municipality: "Monterrey", state: "Nuevo León", addressLine: null, showExactLocation: false, latitude: null, longitude: null,
  bedrooms: 3, bathrooms: 2, parkingSpaces: 1, constructionArea: 120, landArea: 120, ageYears: 2, furnished: null, features: [], contactWhatsapp: null, branchId: null, advisorUserId, published: true, ...over,
});

let orgId = "";
let advisor: { id: string; email: string };
let slugA = "";
let slugB = "";
let propA: { id: string; organizationId: string; advisorUserId: string | null };

const body = (slug: string, startsAt: string, over: Record<string, unknown> = {}) => ({ slug, name: "Pedro Visita", phone: "8112345678", startsAt, consent: true, ...over });

beforeAll(async () => {
  const org = await createTestOrg("VisitReq");
  orgId = org.id;
  await prisma.organizationModule.create({ data: { organizationId: org.id, module: "REALTY", status: "ACTIVE", source: "SUBSCRIBED" } });
  advisor = await createTestUser(org.id, "AGENT", "visit-advisor");
  const zone = await prisma.realtyZone.create({ data: { organizationId: org.id, name: "Seed", key: "seed" } });
  const idA = await saveProperty(org.id, advisor.id, property(zone.id, advisor.id));
  const idB = await saveProperty(org.id, advisor.id, property(zone.id, advisor.id, { title: "Otra casa del mismo asesor" }));
  slugA = (await prisma.realtyProperty.findUniqueOrThrow({ where: { id: idA }, select: { slug: true } })).slug;
  slugB = (await prisma.realtyProperty.findUniqueOrThrow({ where: { id: idB }, select: { slug: true } })).slug;
  propA = { id: idA, organizationId: org.id, advisorUserId: advisor.id };
});

beforeEach(() => {
  sent.length = 0;
  adapter.failWith = null;
});

afterAll(async () => {
  if (!orgId) return;
  await prisma.realtyPropertyVisit.deleteMany({ where: { organizationId: orgId } });
  await prisma.appointment.deleteMany({ where: { organizationId: orgId } });
  await prisma.availabilityRule.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyMatch.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyPropertyStatusHistory.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyProperty.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyZone.deleteMany({ where: { organizationId: orgId } });
  await cleanupOrg(orgId);
});

describe("horarios de visita", () => {
  it("sin horarios en la Agenda: lunes a sábado de 9 a 18 h (hora del negocio)", async () => {
    const { slots } = await listVisitSlots(propA, TUE, NOW);
    expect(slots.map((s) => s.toISOString())).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17].map((h) => at(h)));
    // Domingo sin horarios.
    expect((await listVisitSlots(propA, "2026-11-08", NOW)).slots).toEqual([]);
  });

  it("respeta la anticipación mínima de 2 horas el mismo día", async () => {
    const { slots } = await listVisitSlots(propA, "2026-11-02", NOW); // ya son las 09:00 locales
    expect(slots[0].toISOString()).toBe(at(11, "2026-11-02"));
  });

  it("con horarios en la Agenda solo se ofrece lo configurado", async () => {
    await prisma.availabilityRule.create({ data: { organizationId: orgId, dayOfWeek: 2, startMinute: 10 * 60, endMinute: 13 * 60 } });
    const { slots } = await listVisitSlots(propA, TUE, NOW);
    expect(slots.map((s) => s.toISOString())).toEqual([10, 11, 12].map((h) => at(h)));
    // Con reglas pero ninguna para el miércoles: no hay horarios.
    expect((await listVisitSlots(propA, "2026-11-04", NOW)).slots).toEqual([]);
    await prisma.availabilityRule.deleteMany({ where: { organizationId: orgId } });
  });

  it("rechaza fechas pasadas, demasiado lejanas o mal escritas", async () => {
    await expect(listVisitSlots(propA, "2026-11-01", NOW)).rejects.toMatchObject({ code: "date_invalid" });
    await expect(listVisitSlots(propA, "2026-12-30", NOW)).rejects.toMatchObject({ code: "date_invalid" });
    await expect(listVisitSlots(propA, "mañana", NOW)).rejects.toMatchObject({ code: "date_invalid" });
  });

  it("getVisitSlots por folio: propiedad inexistente → unavailable", async () => {
    await expect(getVisitSlots("no-existe", TUE, NOW)).rejects.toMatchObject({ code: "unavailable" });
    const r = await getVisitSlots(slugA, TUE, NOW);
    expect(r.timezone).toBe("America/Mexico_City");
    expect(r.slots).toHaveLength(9);
  });
});

describe("solicitud de visita → Citas", () => {
  it("crea Lead, cita «Programada» y la visita de la propiedad, y avisa al asesor", async () => {
    const r = await requestVisit(body(slugA, at(10)), { now: NOW });
    expect(r.saved).toBe(true);
    const visit = await prisma.realtyPropertyVisit.findUniqueOrThrow({ where: { id: r.visitId }, include: { appointment: true } });
    expect(visit).toMatchObject({ organizationId: orgId, propertyId: propA.id, advisorUserId: advisor.id });
    expect(visit.appointment).toMatchObject({ status: "SCHEDULED", source: "realty-landing", organizationId: orgId });
    expect(visit.appointment.startTime.toISOString()).toBe(at(10));
    expect(visit.appointment.endTime.getTime() - visit.appointment.startTime.getTime()).toBe(60 * 60_000);
    expect(visit.appointment.title).toContain("Casa visita");
    expect(visit.appointment.description).toContain("Pedro Visita");
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: visit.appointment.leadId! } });
    expect(lead).toMatchObject({ name: "Pedro Visita", phoneKey: "8112345678", assignedTo: advisor.id });
    expect(sent).toEqual([{ to: advisor.email, subject: expect.stringContaining("Pedro Visita") }]);
    // Aparece en la lista de Citas del negocio.
    expect(await prisma.appointment.count({ where: { organizationId: orgId, source: "realty-landing" } })).toBeGreaterThanOrEqual(1);
  });

  it("el horario apartado deja de ofrecerse, también para otra propiedad del mismo asesor", async () => {
    const taken = at(11);
    await requestVisit(body(slugA, taken, { phone: "8100000001" }), { now: NOW });
    expect((await getVisitSlots(slugA, TUE, NOW)).slots).not.toContain(taken);
    expect((await getVisitSlots(slugB, TUE, NOW)).slots).not.toContain(taken);
    await expect(requestVisit(body(slugA, taken, { phone: "8100000002" }), { now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
    await expect(requestVisit(body(slugB, taken, { phone: "8100000003" }), { now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  it("no acepta un horario que no se ofreció (fuera de Agenda, ya pasado o inventado)", async () => {
    await expect(requestVisit(body(slugA, at(3)), { now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
    await expect(requestVisit(body(slugA, `${TUE}T15:30:00Z`), { now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
    await expect(requestVisit(body(slugA, at(10, "2026-11-01")), { now: NOW })).rejects.toMatchObject({ code: "slot_unavailable" });
  });

  it("valida teléfono y consentimiento", async () => {
    await expect(requestVisit(body(slugA, at(14), { phone: "12345678" }), { now: NOW })).rejects.toMatchObject({ code: "phone_invalid" });
    await expect(requestVisit(body(slugA, at(14), { consent: false }), { now: NOW })).rejects.toThrow();
  });

  it("si el plan ya no admite más contactos, la visita se agenda igual con los datos en la cita", async () => {
    adapter.failWith = new UserError("Alcanzaste el límite de contactos de tu plan");
    const r = await requestVisit(body(slugA, at(15), { name: "Sin Contacto", phone: "8100000009" }), { now: NOW });
    expect(r.leadSaved).toBe(false);
    const visit = await prisma.realtyPropertyVisit.findUniqueOrThrow({ where: { id: r.visitId }, include: { appointment: true } });
    expect(visit.appointment.leadId).toBeNull();
    expect(visit.appointment.description).toContain("Sin Contacto");
    expect(visit.appointment.description).toContain("+528100000009");
  });

  it("una propiedad vendida ya no recibe solicitudes", async () => {
    await prisma.realtyProperty.update({ where: { id: propA.id }, data: { status: "SOLD" } });
    await expect(requestVisit(body(slugA, at(16)), { now: NOW })).rejects.toMatchObject({ code: "unavailable" });
    await prisma.realtyProperty.update({ where: { id: propA.id }, data: { status: "AVAILABLE" } });
  });
});
