// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { UserError } from "@/lib/user-error";
import { saveProperty } from "@/lib/realty/service";

const limiter = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: limiter.allowed, retryAfterSeconds: 30 })) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
const adapter = vi.hoisted(() => ({ failWith: null as Error | null }));
vi.mock("@/lib/realty/lead-adapter", async (orig) => {
  const real = await orig<typeof import("@/lib/realty/lead-adapter")>();
  return { ...real, ensureLeadForProspect: vi.fn(async (...args: Parameters<typeof real.ensureLeadForProspect>) => { if (adapter.failWith) throw adapter.failWith; return real.ensureLeadForProspect(...args); }) };
});

import { POST } from "./route";

let orgId = "";
let slug = "";

const valid = (over: Record<string, unknown> = {}) => ({ slug, name: "Laura Interesada", phone: "8112345678", operation: "SALE", propertyType: "HOUSE", maxBudget: 4_500_000, place: "Cumbres", consent: true, ...over });
const call = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://app.test/api/realty/public/inquiries", { method: "POST", headers: { "content-type": "application/json", host: "app.test", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeAll(async () => {
  const org = await createTestOrg("InqRoute");
  orgId = org.id;
  await prisma.organizationModule.create({ data: { organizationId: org.id, module: "REALTY", status: "ACTIVE", source: "SUBSCRIBED" } });
  const user = await createTestUser(org.id, "AGENT", "inqroute");
  const zone = await prisma.realtyZone.create({ data: { organizationId: org.id, name: "Seed", key: "seed" } });
  const id = await saveProperty(org.id, user.id, {
    title: "Casa ruta", description: null, operation: "SALE", propertyType: "HOUSE", status: "AVAILABLE", price: 4_000_000, currency: "MXN", zoneId: zone.id,
    postalCode: "64610", neighborhood: "Cumbres", municipality: "Monterrey", state: "Nuevo León", addressLine: null, showExactLocation: false, latitude: null, longitude: null,
    bedrooms: 3, bathrooms: 2, parkingSpaces: 1, constructionArea: 150, landArea: 150, ageYears: 3, furnished: null, features: [], contactWhatsapp: null, branchId: null, advisorUserId: user.id, published: true,
  });
  slug = (await prisma.realtyProperty.findUniqueOrThrow({ where: { id }, select: { slug: true } })).slug;
});

beforeEach(() => {
  limiter.allowed = true;
  adapter.failWith = null;
});

afterAll(async () => {
  if (!orgId) return;
  await prisma.realtyPropertyEvent.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyMatch.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyLeadProfile.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyPropertyStatusHistory.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyProperty.deleteMany({ where: { organizationId: orgId } });
  await prisma.realtyZone.deleteMany({ where: { organizationId: orgId } });
  await cleanupOrg(orgId);
});

describe("POST /api/realty/public/inquiries", () => {
  it("guarda y responde éxito", async () => {
    const res = await call(valid());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, saved: true });
    expect(await prisma.realtyLeadProfile.count({ where: { organizationId: orgId } })).toBe(1);
  });

  it("acepta el origen del propio sitio y rechaza otros", async () => {
    expect((await call(valid({ phone: "8100000001" }), { origin: "http://app.test" })).status).toBe(200);
    const res = await call(valid({ phone: "8100000002" }), { origin: "https://otro-sitio.example" });
    expect(res.status).toBe(403);
    expect(await prisma.lead.count({ where: { organizationId: orgId, phoneKey: "8100000002" } })).toBe(0);
  });

  it("el campo trampa parece éxito pero no guarda nada", async () => {
    const res = await call(valid({ phone: "8100000003", website: "http://spam.example" }));
    expect(await res.json()).toEqual({ success: true, saved: true });
    expect(await prisma.lead.count({ where: { organizationId: orgId, phoneKey: "8100000003" } })).toBe(0);
  });

  it("datos inválidos: 400 con los campos; JSON roto: 400", async () => {
    const res = await call(valid({ consent: false, phone: "" }));
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error: string; fields: string[] };
    expect(j.error).toBe("invalid");
    expect(j.fields).toEqual(expect.arrayContaining(["consent", "phone"]));
    expect((await call("{no es json")).status).toBe(400);
  });

  it("límite por IP: 429 con Retry-After", async () => {
    limiter.allowed = false;
    const res = await call(valid({ phone: "8100000004" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
  });

  it("errores del formulario salen como códigos", async () => {
    expect(await (await call(valid({ phone: "12345678" }))).json()).toEqual({ error: "phone_invalid" });
    const gone = await call(valid({ slug: "no-existe" }));
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: "unavailable" });
  });

  it("si el plan ya no admite más contactos no falla: saved=false para seguir por WhatsApp", async () => {
    adapter.failWith = new UserError("Alcanzaste el límite de contactos de tu plan");
    const res = await call(valid({ phone: "8100000005" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, saved: false });
  });

  it("GET no está permitido", async () => {
    const { GET } = await import("./route");
    expect((await GET()).status).toBe(405);
  });
});
