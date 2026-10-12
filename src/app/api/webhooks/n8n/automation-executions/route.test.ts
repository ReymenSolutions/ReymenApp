// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createWebhookSignature } from "@/lib/webhook-validator";

const applyExecutionCallback = vi.fn();
vi.mock("@/lib/automation/callback", async (orig) => ({ ...(await orig<typeof import("@/lib/automation/callback")>()), applyExecutionCallback: (...a: unknown[]) => applyExecutionCallback(...a) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0 }) }));

const { POST } = await import("./route");
const SECRET = "cb-secret";

function req(body: unknown, opts: { secret?: string; ts?: string; raw?: string } = {}) {
  const raw = opts.raw ?? JSON.stringify(body);
  const ts = opts.ts ?? String(Date.now());
  return new NextRequest("http://localhost/api/webhooks/n8n/automation-executions", {
    method: "POST",
    headers: { "x-reymen-timestamp": ts, "x-reymen-signature": createWebhookSignature(raw, opts.secret ?? SECRET, ts) },
    body: raw,
  });
}
const valid = { executionId: "e1", token: "t", status: "sent" };

describe("POST /api/webhooks/n8n/automation-executions", () => {
  beforeEach(() => {
    applyExecutionCallback.mockReset();
    vi.stubEnv("N8N_WEBHOOK_SECRET", SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("503 sin secreto configurado", async () => {
    vi.stubEnv("N8N_WEBHOOK_SECRET", "");
    expect((await POST(req(valid))).status).toBe(503);
  });
  it("401 con firma incorrecta o hora vieja", async () => {
    expect((await POST(req(valid, { secret: "otro" }))).status).toBe(401);
    expect((await POST(req(valid, { ts: String(Date.now() - 10 * 60_000) }))).status).toBe(401);
    expect(applyExecutionCallback).not.toHaveBeenCalled();
  });
  it("400 con cuerpo inválido", async () => {
    expect((await POST(req(null, { raw: "no-json" }))).status).toBe(400);
    expect((await POST(req({ ...valid, status: "raro" }))).status).toBe(400);
    expect((await POST(req({ status: "sent" }))).status).toBe(400);
  });
  it("200 aplica el callback; 401 si el token es inválido; 404 si no existe", async () => {
    applyExecutionCallback.mockResolvedValueOnce({ ok: true, changed: true, status: "SUCCEEDED" });
    const res = await POST(req(valid));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, changed: true, status: "SUCCEEDED" });
    applyExecutionCallback.mockResolvedValueOnce({ ok: false, reason: "invalid_token" });
    expect((await POST(req(valid))).status).toBe(401);
    applyExecutionCallback.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    expect((await POST(req(valid))).status).toBe(404);
  });
});
