// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { createWebhookSignature } from "@/lib/webhook-validator";

const SECRET = "smartcard-platform-secret";
const companies = new Map<string, string | null>();
vi.mock("@/lib/smartcard-company", () => ({ getOrgIdForSmartcardCompany: async (id: string) => companies.get(id) ?? null }));

const { POST } = await import("./route");

function request(body: unknown, opts: { secret?: string; ts?: string; eventId?: string; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const ts = opts.ts ?? String(Date.now());
  return new NextRequest("http://localhost/api/webhooks/smartcard/leads", {
    method: "POST",
    headers: {
      "x-smartcard-timestamp": ts,
      "x-smartcard-signature": createWebhookSignature(raw, opts.secret ?? SECRET, ts),
      ...(opts.eventId ? { "x-smartcard-event-id": opts.eventId } : {}),
    },
    body: raw,
  });
}

describe("POST /api/webhooks/smartcard/leads", () => {
  let org: { id: string };
  let noCrm: { id: string };

  beforeAll(async () => {
    process.env.SMARTCARD_WEBHOOK_SECRET = SECRET;
    org = await createTestOrg("SmartCard Leads Org");
    noCrm = await createTestOrg("SmartCard No CRM Org");
    await prisma.organizationModule.deleteMany({ where: { organizationId: noCrm.id, module: "CRM" } });
    companies.set("co-1", org.id);
    companies.set("co-nocrm", noCrm.id);
  });
  afterEach(() => {
    process.env.SMARTCARD_WEBHOOK_SECRET = SECRET;
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(noCrm.id);
    delete process.env.SMARTCARD_WEBHOOK_SECRET;
  });

  const lead = (extra: Record<string, unknown> = {}) => ({ companyId: "co-1", name: "Visitante", phone: "+52 55 4444 0001", message: "Quiero cotizar", cardId: "card-9", memberName: "Ana", ...extra });

  it("crea el lead del negocio dueño de la tarjeta, con fuente smartcard y su mensaje", async () => {
    const res = await POST(request(lead()));
    expect(res.status).toBe(200);
    const created = await prisma.lead.findFirstOrThrow({ where: { organizationId: org.id, phoneKey: "5544440001" } });
    expect(created).toMatchObject({ name: "Visitante", source: "smartcard" });
    expect(created.metadata).toMatchObject({ channel: "smartcard", cardId: "card-9", memberName: "Ana", message: "Quiero cotizar" });
  });

  it("no duplica: el mismo evento y el mismo teléfono se reconocen", async () => {
    await POST(request(lead({ phone: "5544440002" }), { eventId: "ev-1" }));
    const again = await POST(request(lead({ phone: "5544440002" }), { eventId: "ev-1" }));
    expect((await again.json()).duplicate).toBe(true);
    await POST(request(lead({ phone: "55 4444 0002", name: "Otro nombre" })));
    expect(await prisma.lead.count({ where: { organizationId: org.id, phoneKey: "5544440002" } })).toBe(1);
  });

  it("rechaza firma inválida, secreto equivocado y marca de tiempo vieja", async () => {
    expect((await POST(request(lead(), { secret: "otro" }))).status).toBe(401);
    expect((await POST(request(lead(), { ts: String(Date.now() - 3600_000) }))).status).toBe(401);
    const bad = request(lead());
    const tampered = new NextRequest(bad.url, { method: "POST", headers: bad.headers, body: JSON.stringify(lead({ name: "Cambiado" })) });
    expect((await POST(tampered)).status).toBe(401);
  });

  it("sin el secreto configurado responde 503 y no procesa nada", async () => {
    delete process.env.SMARTCARD_WEBHOOK_SECRET;
    expect((await POST(request(lead()))).status).toBe(503);
  });

  it("valida el cuerpo: hace falta compañía, nombre y teléfono o correo", async () => {
    expect((await POST(request(lead({ name: "" })))).status).toBe(400);
    expect((await POST(request({ companyId: "co-1", name: "Sin contacto" }))).status).toBe(400);
    expect((await POST(request(null, { raw: "no es json" }))).status).toBe(400);
  });

  it("company desconocida → 404; negocio sin CRM → 403 y no guarda nada", async () => {
    expect((await POST(request(lead({ companyId: "nadie" })))).status).toBe(404);
    expect((await POST(request(lead({ companyId: "co-nocrm", phone: "5544440003" })))).status).toBe(403);
    expect(await prisma.lead.count({ where: { organizationId: noCrm.id } })).toBe(0);
  });

  it("un cliente del POS con ese teléfono queda enlazado al nuevo contacto", async () => {
    await prisma.customer.create({ data: { organizationId: org.id, phone: "+525544440004", phoneKey: "5544440004", name: "Comprador" } });
    await POST(request(lead({ phone: "5544440004" })));
    const created = await prisma.lead.findFirstOrThrow({ where: { organizationId: org.id, phoneKey: "5544440004" } });
    expect((await prisma.customer.findFirstOrThrow({ where: { organizationId: org.id, phoneKey: "5544440004" } })).leadId).toBe(created.id);
  });
});
