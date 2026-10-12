// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { createWebhookSignature } from "@/lib/webhook-validator";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) }));
vi.mock("@/lib/admin-notifications", () => ({ notifyAdmins: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));

const { POST } = await import("./route");
const { setAnthropicClientForTests } = await import("@/lib/ai/providers/anthropic");
const { setMonthlyBudget, getBudgetState } = await import("@/lib/ai/budget");
const SECRET = "ai-secret";
const MODEL = "n8n-model";
const body = (orgId: string, over: Record<string, unknown> = {}) => ({ organizationId: orgId, requestId: "r1", origin: "n8n", agentKey: "n8n:leads", operation: "classify", system: "Clasifica.", messages: [{ role: "user", content: "hola" }], maxOutputTokens: 100, ...over });
function req(b: unknown, opts: { secret?: string; ts?: string; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(b);
  const ts = opts.ts ?? String(Date.now());
  return new NextRequest("http://localhost/api/webhooks/n8n/ai", { method: "POST", headers: { "x-reymen-timestamp": ts, "x-reymen-signature": createWebhookSignature(raw, opts.secret ?? SECRET, ts) }, body: raw });
}

describe("IA para n8n y POS por el mismo gateway", () => {
  let org: { id: string };
  let other: { id: string };
  const create = vi.fn();
  beforeAll(async () => {
    org = await createTestOrg("N8n AI Org");
    other = await createTestOrg("N8n AI Other");
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "AI_WHATSAPP", status: "ACTIVE", source: "ADMIN_GRANTED" } }).catch(() => undefined);
    await prisma.organizationModule.create({ data: { organizationId: other.id, module: "AI_WHATSAPP", status: "ACTIVE", source: "ADMIN_GRANTED" } }).catch(() => undefined);
    await prisma.aiRate.create({ data: { provider: "anthropic", model: MODEL, currency: "MXN", inputPerMTok: 0, outputPerMTok: 1000, effectiveFrom: new Date("2020-01-01"), source: "test-n8n-ai" } });
  });
  afterAll(async () => {
    await prisma.aiRate.deleteMany({ where: { source: "test-n8n-ai" } });
    await cleanupOrg(org.id);
    await cleanupOrg(other.id);
  });
  beforeEach(async () => {
    create.mockReset().mockResolvedValue({ id: "m", model: MODEL, stop_reason: "end_turn", content: [{ type: "text", text: "etiqueta: lead" }], usage: { input_tokens: 0, output_tokens: 100 } });
    vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("AI_PROVIDER", "anthropic");
    vi.stubEnv("AI_DRAFT_MODEL", MODEL);
    setAnthropicClientForTests({ beta: { messages: { create } } } as never);
    for (const o of [org, other]) {
      await prisma.aiUsage.deleteMany({ where: { organizationId: o.id } });
      await prisma.aiBudgetSetting.deleteMany({ where: { organizationId: o.id } });
    }
    await setMonthlyBudget(org.id, 0.15, "admin1");
  });
  afterEach(() => { setAnthropicClientForTests(null); vi.unstubAllEnvs(); });

  it("503 sin secreto; 401 con firma o hora inválidas; 400 con cuerpo inválido", async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", "");
    expect((await POST(req(body(org.id)))).status).toBe(503);
    vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
    expect((await POST(req(body(org.id), { secret: "otro" }))).status).toBe(401);
    expect((await POST(req(body(org.id), { ts: String(Date.now() - 10 * 60_000) }))).status).toBe(401);
    expect((await POST(req(null, { raw: "no-json" }))).status).toBe(400);
    expect((await POST(req(body(org.id, { origin: "otro" })))).status).toBe(400);
    expect((await POST(req(body(org.id, { messages: [] })))).status).toBe(400);
    expect((await POST(req(body(org.id, { messages: [{ role: "assistant", content: "x" }] })))).status).toBe(400);
    expect((await POST(req(body(org.id, { system: "x".repeat(30_000) })))).status).toBe(400);
  });

  it("responde y carga el costo al tenant correcto (con origen n8n o pos) en el mismo ledger y presupuesto", async () => {
    await setMonthlyBudget(org.id, 1, "admin1");
    const res = await POST(req(body(org.id, { automationId: undefined })));
    const j = await res.json();
    expect(j).toMatchObject({ status: "ok", text: "etiqueta: lead" });
    await POST(req(body(org.id, { requestId: "r2", origin: "pos", agentKey: "pos:upsell" })));
    const rows = await prisma.aiUsage.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => [r.origin, r.agentKey, r.status])).toEqual([["n8n", "n8n:leads", "SUCCEEDED"], ["pos", "pos:upsell", "SUCCEEDED"]]);
    expect((await getBudgetState(org.id)).spentMxn).toBeCloseTo(0.2, 6);
    expect(await prisma.aiUsage.count({ where: { organizationId: other.id } })).toBe(0);
  });

  it("al agotarse el presupuesto responde 'blocked' con traspaso a una persona; otro tenant sigue funcionando; la misma llamada no se repite", async () => {
    await POST(req(body(org.id, { requestId: "a" })));
    const blocked = await POST(req(body(org.id, { requestId: "b" })));
    expect(blocked.status).toBe(200);
    expect(await blocked.json()).toEqual({ status: "blocked", code: "BUDGET_EXHAUSTED", handoff: true });
    expect(create).toHaveBeenCalledTimes(1);
    await prisma.aiBudgetSetting.upsert({ where: { organizationId: other.id }, create: { organizationId: other.id, monthlyBudgetMxn: 5 }, update: { monthlyBudgetMxn: 5 } });
    expect(await (await POST(req(body(other.id, { requestId: "a" })))).json()).toMatchObject({ status: "ok" });
    expect((await POST(req(body(other.id, { requestId: "a" })))).status).toBe(409);
  });

  it("aislamiento: organización inexistente, sin módulo de IA o automatización de otro cliente = 404", async () => {
    expect((await POST(req(body("no-existe")))).status).toBe(404);
    const autoOther = await prisma.automation.create({ data: { organizationId: other.id, name: "x", type: "custom", webhookSecret: "s" } });
    expect((await POST(req(body(org.id, { automationId: autoOther.id })))).status).toBe(404);
    await prisma.organizationModule.deleteMany({ where: { organizationId: org.id, module: "AI_WHATSAPP" } });
    expect((await POST(req(body(org.id)))).status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });
});
