// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const { POST } = await import("./route");

function makeRequest(body: string, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/n8n/conversations", {
    method: "POST",
    headers,
    body,
  });
}

function signed(body: string, secret: string, timestamp = Date.now().toString()) {
  return {
    "x-reymen-signature": createWebhookSignature(body, secret, timestamp),
    "x-reymen-timestamp": timestamp,
  };
}

describe("POST /api/webhooks/n8n/conversations — per-organization secret isolation", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Webhook Conv Org A");
    orgB = await createTestOrg("Webhook Conv Org B");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("le dice a n8n el modo del Agente IA en el canal (sugerir por defecto, off si está apagado)", async () => {
    const body = (channel: string) => JSON.stringify({ contactHandle: `h-${channel}`, channel, message: { role: "USER", content: "hola" } });
    const send = async (channel: string) => {
      const b = body(channel);
      const res = await POST(makeRequest(b, { ...signed(b, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id }));
      return res.json();
    };
    expect(await send("instagram")).toMatchObject({ aiMode: "suggest" });
    await prisma.agentChannelSetting.create({ data: { organizationId: orgA.id, channel: "messenger", mode: "OFF" } });
    expect(await send("messenger")).toMatchObject({ aiMode: "off" });
  });

  it("accepts a request signed with the target org's own secret", async () => {
    const body = JSON.stringify({
      contactPhone: "+15551234567",
      channel: "whatsapp",
      message: { role: "USER", content: "hola" },
    });

    const res = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(200);

    const conv = await prisma.conversation.findFirst({ where: { organizationId: orgA.id } });
    expect(conv).not.toBeNull();
  });

  it("CRITICAL: rejects a request signed with org B's secret but targeting org A", async () => {
    const body = JSON.stringify({
      contactPhone: "+15559999999",
      channel: "whatsapp",
      message: { role: "USER", content: "forged message" },
    });

    const res = await POST(
      makeRequest(body, { ...signed(body, orgB.n8nWebhookSecret), "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(401);

    const forged = await prisma.conversation.findFirst({
      where: { organizationId: orgA.id, contactPhone: "+15559999999" },
    });
    expect(forged).toBeNull();
  });

  it("rejects a request with no orgId header", async () => {
    const body = JSON.stringify({ contactPhone: "+1", channel: "whatsapp", message: { role: "USER", content: "x" } });
    const res = await POST(makeRequest(body, { "x-reymen-signature": "sha256=whatever", "x-reymen-timestamp": Date.now().toString() }));
    expect(res.status).toBe(401);
  });

  it("CRITICAL: rejects a validly-signed request whose timestamp is outside the freshness window (replay)", async () => {
    const body = JSON.stringify({
      contactPhone: "+15550001111",
      channel: "whatsapp",
      message: { role: "USER", content: "replayed" },
    });
    const staleTimestamp = (Date.now() - 10 * 60 * 1000).toString();
    const res = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret, staleTimestamp), "x-reymen-orgid": orgA.id })
    );
    expect(res.status).toBe(401);

    const replayed = await prisma.conversation.findFirst({ where: { organizationId: orgA.id, contactPhone: "+15550001111" } });
    expect(replayed).toBeNull();
  });

  it("idempotency: resending the same message externalId does not append it twice", async () => {
    const body = JSON.stringify({
      contactPhone: "+15552223333",
      channel: "whatsapp",
      message: { role: "USER", content: "hola de nuevo", externalId: "wa-msg-abc" },
    });

    const first = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id, "x-reymen-event-id": "evt-conv-a" })
    );
    expect(first.status).toBe(200);

    const second = await POST(
      makeRequest(body, { ...signed(body, orgA.n8nWebhookSecret), "x-reymen-orgid": orgA.id, "x-reymen-event-id": "evt-conv-b" })
    );
    expect(second.status).toBe(200);

    const conv = await prisma.conversation.findFirstOrThrow({ where: { organizationId: orgA.id, contactPhone: "+15552223333" } });
    const messageCount = await prisma.message.count({ where: { conversationId: conv.id, externalId: "wa-msg-abc" } });
    expect(messageCount).toBe(1);
  });
});
