// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { applyTemplateInstall } from "@/lib/template-install";
import { triggerAutomationWorkflow } from "@/lib/automation/config-delivery";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) }));

const { POST } = await import("./route");
const SECRET = "cfg-secret";
const bi = (t: string) => ({ es: t, en: t });
const SPEC = {
  openHour: { kind: "hour", group: "when", label: bi("Abre"), help: bi("h"), default: 9 },
  channel: { kind: "select", group: "channel", options: { whatsapp: bi("WhatsApp"), sms: bi("SMS") }, default: "whatsapp", label: bi("Canal"), help: bi("c") },
  contact: { kind: "phone", group: "who", required: true, label: bi("Responsable"), help: bi("r") },
};

function req(body: unknown, opts: { secret?: string; ts?: string; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const ts = opts.ts ?? String(Date.now());
  return new NextRequest("http://localhost/api/webhooks/n8n/automation-config", {
    method: "POST",
    headers: { "x-reymen-timestamp": ts, "x-reymen-signature": createWebhookSignature(raw, opts.secret ?? SECRET, ts) },
    body: raw,
  });
}

describe("configuración de una automatización para n8n", () => {
  let org: { id: string };
  let other: { id: string };
  let templateId: string;
  let automationId: string;

  beforeAll(async () => {
    org = await createTestOrg("Cfg Delivery Org");
    other = await createTestOrg("Cfg Delivery Other");
    const tpl = await prisma.automationTemplate.create({ data: { name: "Genérica", description: "Plantilla genérica de prueba", industry: "clinic", category: "lead_capture", isPublished: true } });
    templateId = tpl.id;
    const version = await prisma.templateVersion.create({ data: { templateId, version: "1.0.0", n8nWorkflowJson: {}, configSpec: SPEC } });
    ({ automationId } = await applyTemplateInstall({ orgId: org.id, userId: "u", templateId, template: tpl, version, config: { channel: "sms" } }));
  });
  afterAll(async () => {
    for (const o of [org, other]) { await prisma.templateInstallation.deleteMany({ where: { organizationId: o.id } }); await cleanupOrg(o.id); }
    await prisma.templateVersion.deleteMany({ where: { templateId } });
    await prisma.automationTemplate.delete({ where: { id: templateId } });
  });
  beforeEach(() => vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET));
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("503 sin secreto; 401 con firma incorrecta u hora vieja; 400 con cuerpo inválido", async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", "");
    expect((await POST(req({ organizationId: org.id, automationId }))).status).toBe(503);
    vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
    expect((await POST(req({ organizationId: org.id, automationId }, { secret: "otro" }))).status).toBe(401);
    expect((await POST(req({ organizationId: org.id, automationId }, { ts: String(Date.now() - 10 * 60_000) }))).status).toBe(401);
    expect((await POST(req(null, { raw: "no-json" }))).status).toBe(400);
    expect((await POST(req({ organizationId: org.id }))).status).toBe(400);
    expect((await POST(req({ automationId }))).status).toBe(400);
  });

  it("devuelve la configuración vigente (fábrica + guardado), la plantilla y lo obligatorio que falta; sin secretos", async () => {
    const res = await POST(req({ organizationId: org.id, automationId }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ organizationId: org.id, automationId, status: "ACTIVE", template: { id: templateId, version: "1.0.0" }, configuration: { openHour: 9, channel: "sms" }, missingRequired: ["contact"] });
    expect(JSON.stringify(body)).not.toMatch(/webhookSecret|secret/i);
    await prisma.automation.update({ where: { id: automationId }, data: { config: { channel: "sms", contact: "+5215512345678" } } });
    expect(await (await POST(req({ organizationId: org.id, automationId }))).json()).toMatchObject({ configuration: { contact: "+5215512345678" }, missingRequired: [] });
  });

  it("también se puede pedir por plantilla instalada (flujos que empiezan en un canal)", async () => {
    const res = await POST(req({ organizationId: org.id, templateId }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ automationId });
  });

  it("aislamiento: otra organización, id inexistente o automatización pausada responden igual (404)", async () => {
    expect((await POST(req({ organizationId: other.id, automationId }))).status).toBe(404); // es de otro cliente
    expect((await POST(req({ organizationId: other.id, templateId }))).status).toBe(404);
    expect((await POST(req({ organizationId: org.id, automationId: "no-existe" }))).status).toBe(404);
    await prisma.automation.update({ where: { id: automationId }, data: { status: "PAUSED" } });
    expect((await POST(req({ organizationId: org.id, automationId }))).status).toBe(404);
    await prisma.automation.update({ where: { id: automationId }, data: { status: "ACTIVE" } });
  });

  it("por evento: el cuerpo firmado que Reymen manda a n8n trae organizationId, automationId y la configuración", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const out = await triggerAutomationWorkflow(automationId, "mi-flujo", "lead.created", { leadId: "L1" });
    expect(out.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/webhook\/mi-flujo$/);
    expect(JSON.parse(init.body)).toMatchObject({ organizationId: org.id, event: "lead.created", data: { leadId: "L1" }, automation: { automationId, organizationId: org.id, configuration: { channel: "sms" } } });
    expect(init.headers["X-Reymen-Signature"]).toMatch(/^sha256=/);
    // Una automatización pausada no recibe eventos.
    await prisma.automation.update({ where: { id: automationId }, data: { status: "PAUSED" } });
    expect((await triggerAutomationWorkflow(automationId, "mi-flujo", "lead.created")).success).toBe(false);
    await prisma.automation.update({ where: { id: automationId }, data: { status: "ACTIVE" } });
  });
});
