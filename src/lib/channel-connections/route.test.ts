// @vitest-environment node
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { createWebhookSignature } from "@/lib/webhook-validator";
import { POST } from "@/app/api/webhooks/n8n/channels/route";
import { retryWebhookEvent } from "@/lib/webhook-retry";
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));
const orgs: string[] = [];
async function fixture() {
  const org = await createTestOrg("Phase3 Route"); orgs.push(org.id);
  const row = await prisma.channelConnection.create({ data: { organizationId: org.id, label: "Fixture account", channel: "whatsapp", externalAccountKey: "external-account", credentialRef: "organization" } });
  const event = { version: 1, connectionId: row.id, externalAccountKey: row.externalAccountKey, generation: 1, type: "health", eventId: "health-1", sequence: 1, observedAt: new Date().toISOString(), state: "HEALTHY", providerVerified: true, canReceive: true, canSend: true, outboundContractVersion: 1 };
  return { org, row, event };
}
function request(org: { id: string; n8nWebhookSecret: string }, body: unknown, extra: Record<string, string> = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body), timestamp = String(Date.now());
  return new NextRequest("http://localhost/api/webhooks/n8n/channels", { method: "POST", body: raw, headers: { "x-reymen-orgid": org.id, "x-reymen-timestamp": timestamp, "x-reymen-signature": createWebhookSignature(raw, org.n8nWebhookSecret, timestamp), ...extra } });
}
beforeEach(() => { vi.stubEnv("AI_CHANNEL_CONNECTIONS_ENABLED", "true"); });
afterEach(async () => { for (const organizationId of orgs.splice(0)) { await prisma.conversation.updateMany({ where: { organizationId }, data: { channelConnectionId: null, externalThreadId: null } }); await prisma.channelConnection.deleteMany({ where: { organizationId } }); await cleanupOrg(organizationId); } vi.unstubAllEnvs(); });
describe("versioned connector authentication and durable recovery", () => {
  it("requires HMAC even in development and rejects forged/stale/cross-tenant signatures", async () => {
    const a = await fixture(), b = await fixture();
    for (const headers of ([{ "x-reymen-signature": "" }, { "x-reymen-signature": "bad", "x-reymen-secret": a.org.n8nWebhookSecret }, { "x-reymen-timestamp": String(Date.now() - 600000) }, { "x-reymen-orgid": b.org.id }] as Record<string, string>[])) expect((await POST(request(a.org, a.event, headers))).status).toBe(401);
    expect(await prisma.webhookEvent.count({ where: { organizationId: a.org.id } })).toBe(0);
  });
  it("rejects wrong accounts, foreign IDs, unsupported versions, extra credentials, malformed or oversized payloads", async () => {
    const a = await fixture(), b = await fixture();
    for (const patch of [{ externalAccountKey: "wrong" }, { connectionId: b.row.id }, { version: 2 }, { accessToken: "never-store-me" }, { generation: 2 }]) expect((await POST(request(a.org, { ...a.event, ...patch }))).status).toBe(400);
    expect((await POST(request(a.org, "{"))).status).toBe(400);
    expect((await POST(request(a.org, "x".repeat(65537)))).status).toBe(413);
    expect(await prisma.webhookEvent.count({ where: { organizationId: a.org.id } })).toBe(0);
  });
  it("deduplicates concurrent deliveries per connection and rejects health observations outside freshness bounds", async () => {
    const f = await fixture();
    const responses = await Promise.all([POST(request(f.org, f.event)), POST(request(f.org, f.event))]); expect(responses.map(x => x.status)).toEqual([200, 200]);
    expect(await prisma.webhookEvent.count({ where: { organizationId: f.org.id, source: `channel-v1:${f.row.id}` } })).toBe(1);
    expect((await POST(request(f.org, { ...f.event, eventId: "expired", sequence: 2, observedAt: new Date(Date.now() - 600000).toISOString() }))).status).toBe(503);
    expect(await prisma.channelConnection.findUnique({ where: { id: f.row.id } })).toMatchObject({ healthSequence: 1 });
  });
  it("uses the stable provider message ID across rewritten envelopes without duplicating a thread", async () => {
    const f = await fixture(); expect((await POST(request(f.org, f.event))).status).toBe(200);
    await prisma.channelConnection.update({ where: { id: f.row.id }, data: { enabled: true } });
    const message = { version: 1, type: "message", connectionId: f.row.id, externalAccountKey: f.row.externalAccountKey, generation: 1, eventId: "provider-message-1", externalThreadId: "thread-1", contactPhone: "8112345678", message: { externalId: "provider-message-1", content: "Hola" } };
    expect((await POST(request(f.org, { ...message, eventId: "new-execution-id" }))).status).toBe(400);
    expect((await POST(request(f.org, message))).status).toBe(200);
    const duplicate = await POST(request(f.org, { ...message, externalThreadId: "thread-2" })); expect(await duplicate.json()).toMatchObject({ duplicate: true });
    expect(await prisma.conversation.count({ where: { organizationId: f.org.id } })).toBe(1);
    expect(await prisma.message.count({ where: { conversation: { organizationId: f.org.id }, role: "USER" } })).toBe(1);
  });
  it("preserves failed work and revalidates account generation on durable retry", async () => {
    const f = await fixture();
    const event = await prisma.webhookEvent.create({ data: { organizationId: f.org.id, source: `channel-v1:${f.row.id}`, eventType: "channel.v1", payload: f.event, externalEventId: "recover", status: "FAILED", attempts: 1 } });
    expect(await retryWebhookEvent(event.id)).toEqual({ success: true });
    const blocked = await prisma.webhookEvent.create({ data: { organizationId: f.org.id, source: `channel-v1:${f.row.id}`, eventType: "channel.v1", payload: { ...f.event, eventId: "old", sequence: 2 }, externalEventId: "old", status: "FAILED", attempts: 1 } });
    await prisma.channelConnection.update({ where: { id: f.row.id }, data: { generation: 2 } }); expect(await retryWebhookEvent(blocked.id)).toEqual({ success: false });
  });
  it("continues trusted health ingress with CRM when AI is inactive", async () => {
    const f = await fixture();
    await prisma.organizationModule.updateMany({ where: { organizationId: f.org.id, module: "AI_WHATSAPP" }, data: { status: "SUSPENDED" } });
    expect((await POST(request(f.org, f.event))).status).toBe(200);
  });
  it("rejects suspended organizations, inactive modules and the global pause without admitting events", async () => {
    const f = await fixture();
    await prisma.organization.update({ where: { id: f.org.id }, data: { isActive: false } }); expect((await POST(request(f.org, f.event))).status).toBe(403);
    await prisma.organization.update({ where: { id: f.org.id }, data: { isActive: true } });
    await prisma.organizationModule.deleteMany({ where: { organizationId: f.org.id, module: { in: ["CRM", "AI_WHATSAPP"] } } }); expect((await POST(request(f.org, f.event))).status).toBe(403);
    vi.stubEnv("AI_CHANNEL_CONNECTIONS_ENABLED", "false"); expect((await POST(request(f.org, f.event))).status).toBe(503);
    expect(await prisma.webhookEvent.count({ where: { organizationId: f.org.id } })).toBe(0);
  });
});
