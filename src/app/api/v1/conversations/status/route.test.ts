// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { GET } = await import("./route");

function makeRequest(url: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(url, { headers });
}

describe("GET /api/v1/conversations/status", () => {
  let orgA: { id: string; n8nWebhookSecret: string };
  let orgB: { id: string; n8nWebhookSecret: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Conv Status Org A");
    orgB = await createTestOrg("Conv Status Org B");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("returns aiHandled:true with no conversation when none exists for that phone", async () => {
    const res = await GET(
      makeRequest(`http://localhost/api/v1/conversations/status?orgId=${orgA.id}&contactPhone=%2B15550000001`, {
        "x-api-key": orgA.n8nWebhookSecret,
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ conversationId: null, aiHandled: true, status: null, assignedToId: null });
  });

  it("returns the real aiHandled/status/assignedToId for an existing open conversation", async () => {
    const user = await prisma.user.create({
      data: { email: `assignee-${Date.now()}@test.local`, name: "Assignee", role: "AGENT", organizationId: orgA.id, passwordHash: "x" },
    });
    const conv = await prisma.conversation.create({
      data: { organizationId: orgA.id, channel: "whatsapp", contactPhone: "+15550000002", aiHandled: false, assignedToId: user.id },
    });

    const res = await GET(
      makeRequest(`http://localhost/api/v1/conversations/status?orgId=${orgA.id}&contactPhone=%2B15550000002`, {
        "x-api-key": orgA.n8nWebhookSecret,
      })
    );
    const body = await res.json();
    expect(body.data).toEqual({ conversationId: conv.id, aiHandled: false, status: "OPEN", assignedToId: user.id });
  });

  it("CRITICAL: rejects a request authenticated with org B's key but targeting org A's data", async () => {
    const res = await GET(
      makeRequest(`http://localhost/api/v1/conversations/status?orgId=${orgA.id}&contactPhone=%2B15550000002`, {
        "x-api-key": orgB.n8nWebhookSecret,
      })
    );
    expect(res.status).toBe(401);
  });

  it("rejects a request with no api key and no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeRequest(`http://localhost/api/v1/conversations/status?orgId=${orgA.id}&contactPhone=%2B1`));
    expect(res.status).toBe(401);
  });

  it("requires either conversationId or contactPhone", async () => {
    const res = await GET(
      makeRequest(`http://localhost/api/v1/conversations/status?orgId=${orgA.id}`, { "x-api-key": orgA.n8nWebhookSecret })
    );
    expect(res.status).toBe(400);
  });
});

describe("phase0: status channel isolation", () => {
  const orgs: string[] = [];
  afterAll(async () => { for (const id of orgs) await cleanupOrg(id); });
  it("defaults phone-only legacy lookup to WhatsApp and supports explicit canonical aliases", async () => {
    const org = await createTestOrg("Phase0 Status"); orgs.push(org.id);
    const phone = "+52 81 1234 5678";
    const wa = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp", contactPhone: phone, phoneKey: "8112345678", aiHandled: false } });
    const ig = await prisma.conversation.create({ data: { organizationId: org.id, channel: "instagram", contactPhone: phone, phoneKey: "8112345678", aiHandled: true } });
    const url = `http://localhost/api/v1/conversations/status?orgId=${org.id}&contactPhone=8112345678`;
    const headers = { "x-api-key": org.n8nWebhookSecret };
    expect((await (await GET(makeRequest(url, headers))).json()).data.conversationId).toBe(wa.id);
    expect((await (await GET(makeRequest(url + "&channel=ig", headers))).json()).data.conversationId).toBe(ig.id);
    const mismatch = await GET(makeRequest(`http://localhost/api/v1/conversations/status?orgId=${org.id}&conversationId=${ig.id}&channel=whatsapp`, headers));
    expect(mismatch.status).toBe(404);
  });
});
