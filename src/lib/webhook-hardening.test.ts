// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { processWebhookEventPayload } from "./webhook-processors";
import { retryWebhookEvent, retryAllFailedWebhookEvents, WebhookRetryError, STALE_PROCESSING_MS } from "./webhook-retry";
import { createOrgWebhookHandler } from "./org-webhook-route";

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
// Un tipo "lento" simula un procesamiento que tarda, para que los reintentos realmente se traslapen.
vi.mock("./webhook-processors", async (importOriginal) => {
  const real = await importOriginal<typeof import("./webhook-processors")>();
  return { ...real, processWebhookEventPayload: async (type: string, payload: unknown, orgId: string) => (type === "slow.event" ? new Promise<void>((r) => setTimeout(r, 300)) : real.processWebhookEventPayload(type, payload, orgId)) };
});

describe("auditoría: webhooks (AUD-007, AUD-008, AUD-009)", () => {
  let org: { id: string };
  let secret: string;
  beforeAll(async () => {
    org = await createTestOrg("Webhook Hardening");
    secret = (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).n8nWebhookSecret;
  });
  afterAll(async () => { await cleanupOrg(org.id); });

  it("AUD-007: el reintento conoce los eventos de ventas del POS y de delivery (ya no 'Unknown webhook event type')", async () => {
    // Sin módulos de POS/Food, el reintento falla por una causa de NEGOCIO, no por no reconocer el tipo.
    await expect(processWebhookEventPayload("order.completed", {}, org.id)).rejects.toThrow(/Reymen POS no está activado/);
    await expect(processWebhookEventPayload("delivery.order", {}, org.id)).rejects.toThrow(/Food/);
    await expect(processWebhookEventPayload("otro.evento", {}, org.id)).rejects.toThrow(/Unknown webhook event type/);
  });

  it("AUD-008: dos reintentos simultáneos del mismo evento solo ejecutan el procesamiento una vez", async () => {
    const event = await prisma.webhookEvent.create({ data: { organizationId: org.id, source: "n8n", eventType: "slow.event", payload: {}, status: "FAILED", attempts: 1 } });
    const results = await Promise.allSettled([retryWebhookEvent(event.id), retryWebhookEvent(event.id), retryWebhookEvent(event.id)]);
    const lost = results.filter((r) => r.status === "rejected" && r.reason instanceof WebhookRetryError);
    expect(lost.length).toBe(2);
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: event.id } })).attempts).toBe(2);
  });

  it("AUD-008: un PROCESSING abandonado se recupera, y uno reciente no se toca", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - STALE_PROCESSING_MS - 60_000);
    const stale = await prisma.webhookEvent.create({ data: { organizationId: org.id, source: "n8n", eventType: "otro.evento", payload: {}, status: "PROCESSING", attempts: 1, claimedAt: old, createdAt: old } });
    const fresh = await prisma.webhookEvent.create({ data: { organizationId: org.id, source: "n8n", eventType: "otro.evento", payload: {}, status: "PROCESSING", attempts: 1, claimedAt: now } });
    await retryAllFailedWebhookEvents({ organizationId: org.id, now });
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: stale.id } })).attempts).toBe(2);
    expect((await prisma.webhookEvent.findUniqueOrThrow({ where: { id: fresh.id } })).attempts).toBe(1);
    await expect(retryWebhookEvent(fresh.id, now)).rejects.toThrow(/se está procesando/);
  });

  describe("AUD-009: idempotencia de entregas firmadas", () => {
    const body = JSON.stringify({ grossAmount: 10 });
    const process = vi.fn().mockResolvedValue(undefined);
    const POST = createOrgWebhookHandler({ rateLimitKey: "hardening", source: "pos", eventType: "order.completed", process, requireEventId: true });
    const signed = (eventId: string | null, timestamp = String(Date.now())) => {
      const signature = "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
      const headers: Record<string, string> = { "x-reymen-orgid": org.id, "x-reymen-signature": signature, "x-reymen-timestamp": timestamp };
      if (eventId) headers["x-reymen-event-id"] = eventId;
      return new NextRequest("http://localhost/api/webhooks/pos/orders", { method: "POST", body, headers });
    };

    it("sin x-reymen-event-id una venta se rechaza (no puede duplicarse por omisión del header)", async () => {
      const res = await POST(signed(null));
      expect(res.status).toBe(400);
      expect(process).not.toHaveBeenCalled();
    });

    it("la misma entrega firmada reenviada con otro event-id se descarta por su firma", async () => {
      const timestamp = String(Date.now());
      expect((await POST(signed("orden-1", timestamp))).status).toBe(200);
      const replay = await POST(signed("orden-1-variado", timestamp));
      expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({ duplicate: true });
      expect(process).toHaveBeenCalledTimes(1);
    });
  });
});
