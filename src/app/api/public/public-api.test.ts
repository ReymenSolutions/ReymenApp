// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";

const preview = vi.fn();
vi.mock("@/lib/ai-auto-reply", () => ({ previewAgentReply: (...a: unknown[]) => preview(...a) }));
vi.mock("@/lib/ai-draft", () => ({ isDraftProviderConfigured: () => true }));
type Mail = { to: string; subject: string; html: string; text?: string };
const sendEmail = vi.fn<(m: Mail) => Promise<{ sent: boolean }>>(async () => ({ sent: true }));
vi.mock("@/lib/email", () => ({ sendEmail: (m: Mail) => sendEmail(m) }));

const leads = await import("./leads/route");
const chat = await import("./chat/route");
const plans = await import("./plans/route");

let n = 0;
function req(path: string, body: unknown, headers: Record<string, string> = {}) {
  n += 1;
  return new NextRequest(`http://localhost/api/public/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-real-ip": `10.${Math.floor(Math.random() * 250)}.${Math.floor(n / 250)}.${n % 250}`, ...headers },
    body: JSON.stringify(body),
  });
}
const ORIGIN = { origin: "https://reymen.mx" };

describe("API pública del sitio", () => {
  let org: { id: string; slug: string };

  beforeAll(async () => {
    org = await createTestOrg("Web Org");
    process.env.WEB_LEADS_ORG_SLUG = org.slug;
  });
  afterEach(() => {
    preview.mockReset();
    delete process.env.PUBLIC_PLANS_ENABLED;
  });
  afterAll(async () => {
    delete process.env.WEB_LEADS_ORG_SLUG;
    await cleanupOrg(org.id);
  });

  const lead = (extra: Record<string, unknown> = {}) => ({ name: "Ana Prueba", contact: "55 1234 5678", business: "Café Sol", vertical: "restaurantes", consent: true, ...extra });

  describe("leads", () => {
    it("rechaza un origen no permitido", async () => {
      const res = await leads.POST(req("leads", lead(), { origin: "https://malo.example" }));
      expect(res.status).toBe(403);
    });

    it("exige el consentimiento", async () => {
      const res = await leads.POST(req("leads", lead({ consent: false }), ORIGIN));
      expect(res.status).toBe(400);
    });

    it("crea el lead con WhatsApp normalizado y el consentimiento guardado", async () => {
      const res = await leads.POST(req("leads", lead(), ORIGIN));
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("https://reymen.mx");
      const created = await prisma.lead.findFirstOrThrow({ where: { organizationId: org.id, phone: "+525512345678" } });
      expect(created).toMatchObject({ name: "Ana Prueba", source: "web" });
      expect(created.metadata).toMatchObject({ business: "Café Sol", consent: { accepted: true } });
    });

    it("avisa a los dueños con un correo con formato y sin HTML del visitante", async () => {
      const owner = await createTestUser(org.id, "OWNER", "web-owner");
      sendEmail.mockClear();
      const res = await leads.POST(req("leads", lead({ name: "Eva <b>Hack</b>", contact: "eva@example.com", message: "<script>x</script> hola" }), ORIGIN));
      expect(res.status).toBe(200);
      const mail = sendEmail.mock.calls.map((c) => c[0]).find((m) => m.to === owner.email);
      expect(mail).toBeTruthy();
      expect(mail!.html).toContain("Reymen");
      expect(mail!.html).toContain("Ver en el CRM");
      expect(mail!.html).not.toContain("<script>x");
      expect(mail!.html).toContain("&lt;b&gt;Hack");
    });

    it("el campo trampa parece éxito pero no guarda nada", async () => {
      const res = await leads.POST(req("leads", lead({ name: "Bot Malo", contact: "bot@spam.example", website: "http://spam" }), ORIGIN));
      expect(res.status).toBe(200);
      expect(await prisma.lead.count({ where: { organizationId: org.id, name: "Bot Malo" } })).toBe(0);
    });

    it("limita a 5 envíos por hora desde la misma IP", async () => {
      const ip = { ...ORIGIN, "x-real-ip": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` };
      const codes: number[] = [];
      for (let i = 0; i < 6; i++) codes.push((await leads.POST(req("leads", lead({ contact: `bot${i}@example.com` }), ip))).status);
      expect(codes.slice(0, 5).every((c) => c === 200)).toBe(true);
      expect(codes[5]).toBe(429);
    });
  });

  describe("planes", () => {
    it("apagado por defecto (404) y visible al encenderlo", async () => {
      const off = await plans.GET(new NextRequest("http://localhost/api/public/plans", { headers: ORIGIN }));
      expect(off.status).toBe(404);
      process.env.PUBLIC_PLANS_ENABLED = "true";
      const on = await plans.GET(new NextRequest("http://localhost/api/public/plans", { headers: ORIGIN }));
      expect(on.status).toBe(200);
      expect(Array.isArray((await on.json()).plans)).toBe(true);
    });
  });

  describe("chat", () => {
    const sid = "sess_abcdefghijklmnop";
    const msg = (message: string, sessionId = sid) => req("chat", { sessionId, message }, ORIGIN);

    it("responde 503 si el canal está apagado", async () => {
      await prisma.agentChannelSetting.upsert({ where: { organizationId_channel: { organizationId: org.id, channel: "webchat" } }, create: { organizationId: org.id, channel: "webchat", mode: "OFF" }, update: { mode: "OFF" } });
      expect((await chat.POST(msg("Hola"))).status).toBe(503);
    });

    it("guarda la conversación y devuelve la respuesta del agente", async () => {
      await prisma.organizationModule.upsert({ where: { organizationId_module: { organizationId: org.id, module: "AI_WHATSAPP" } }, create: { organizationId: org.id, module: "AI_WHATSAPP" }, update: {} });
      await prisma.agentChannelSetting.update({ where: { organizationId_channel: { organizationId: org.id, channel: "webchat" } }, data: { mode: "AUTO" } });
      preview.mockResolvedValue({ action: "reply", reply: "¡Hola! Cuéntame de tu negocio." });
      const res = await chat.POST(msg("Hola, quiero un POS"));
      expect(await res.json()).toEqual({ reply: "¡Hola! Cuéntame de tu negocio.", handoff: false });
      const conv = await prisma.conversation.findFirstOrThrow({ where: { organizationId: org.id, channel: "webchat", contactHandle: `web:${sid}` }, include: { messages: { orderBy: { createdAt: "asc" } } } });
      expect(conv.messages.map((m) => m.role)).toEqual(["USER", "ASSISTANT"]);
    });

    it("si el agente duda, pasa a una persona y deja de responder", async () => {
      const s2 = "sess_zzzzzzzzzzzzzzzz";
      preview.mockResolvedValue({ action: "escalate", kind: "model", reason: "pide precios" });
      const res = await chat.POST(msg("¿Cuánto cuesta?", s2));
      expect(await res.json()).toMatchObject({ reply: null, handoff: true });
      const conv = await prisma.conversation.findFirstOrThrow({ where: { organizationId: org.id, contactHandle: `web:${s2}` } });
      expect(conv.status).toBe("ESCALATED");
      preview.mockClear();
      expect(await (await chat.POST(msg("¿Hola?", s2))).json()).toMatchObject({ handoff: true });
      expect(preview).not.toHaveBeenCalled();
    });

    it("valida el mensaje y el origen", async () => {
      expect((await chat.POST(req("chat", { sessionId: "x", message: "hola" }, ORIGIN))).status).toBe(400);
      expect((await chat.POST(req("chat", { sessionId: sid, message: "x".repeat(501) }, ORIGIN))).status).toBe(400);
      expect((await chat.POST(req("chat", { sessionId: sid, message: "hola" }, { origin: "https://malo.example" }))).status).toBe(403);
    });
  });
});
