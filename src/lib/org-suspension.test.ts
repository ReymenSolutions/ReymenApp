// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { authenticateOrgRequest } = await import("./api-key-auth");
const { createOrgWebhookHandler } = await import("./org-webhook-route");

// AUD-006: suspender una organización cierra también las API keys y los webhooks firmados.
describe("organización suspendida", () => {
  let org: { id: string };
  let secret: string;
  beforeAll(async () => {
    org = await createTestOrg("Suspension");
    secret = (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).n8nWebhookSecret;
  });
  afterAll(async () => { await cleanupOrg(org.id); });
  const setActive = (isActive: boolean) => prisma.organization.update({ where: { id: org.id }, data: { isActive } });

  it("la API key deja de abrir las rutas /api/v1 mientras está suspendida", async () => {
    const req = () => new NextRequest(`http://localhost/api/v1/x?orgId=${org.id}`, { headers: { "x-api-key": secret } });
    await setActive(true);
    expect((await authenticateOrgRequest(req())).orgId).toBe(org.id);
    await setActive(false);
    const res = await authenticateOrgRequest(req());
    expect(res.response?.status).toBe(401);
    await setActive(true);
  });

  it("un webhook bien firmado no ingresa eventos de una organización suspendida", async () => {
    const process = vi.fn().mockResolvedValue({});
    const POST = createOrgWebhookHandler({ rateLimitKey: "suspension-test", source: "n8n", eventType: "test.event", process, successBody: () => ({}) });
    const body = JSON.stringify({ hello: "world" });
    const send = () => {
      const timestamp = String(Date.now());
      const signature = "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
      return POST(new NextRequest("http://localhost/api/webhooks/n8n/test", { method: "POST", body, headers: { "x-reymen-orgid": org.id, "x-reymen-signature": signature, "x-reymen-timestamp": timestamp, "x-reymen-event-id": `e-${Math.random()}` } }));
    };
    await setActive(false);
    expect((await send() as NextResponse).status).toBe(403);
    expect(process).not.toHaveBeenCalled();
    await setActive(true);
    expect((await send() as NextResponse).status).toBe(200);
    expect(process).toHaveBeenCalledTimes(1);
  });
});
