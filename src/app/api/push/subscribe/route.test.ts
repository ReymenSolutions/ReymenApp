// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg, fakeSession } from "@/test/helpers";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
const { GET, POST, DELETE } = await import("./route");

const req = (method: string, body?: unknown) => new NextRequest("http://localhost/api/push/subscribe", { method, body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json", "user-agent": "vitest" } });
const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });

describe("alta y baja de dispositivos para avisos push", () => {
  let org: { id: string };
  let a: { id: string };
  let b: { id: string };
  const endpoint = `https://fcm.googleapis.com/fcm/send/test-${Date.now()}`;

  beforeAll(async () => {
    await prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: "push-subscribe:" } } }).catch(() => undefined);
    org = await createTestOrg("Push Route Org");
    a = await createTestUser(org.id, "AGENT", "push-a");
    b = await createTestUser(org.id, "OWNER", "push-b");
  });
  afterAll(async () => {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    await cleanupOrg(org.id);
  });

  it("sin sesión no deja suscribirse", async () => {
    authMock.mockResolvedValue(null);
    expect((await POST(req("POST", sub(endpoint)))).status).toBe(401);
    expect((await GET()).status).toBe(401);
  });

  it("rechaza datos inválidos o un servicio que no es https", async () => {
    authMock.mockResolvedValue(fakeSession({ id: a.id, role: "AGENT", organizationId: org.id }));
    expect((await POST(req("POST", { endpoint: "http://evil/x", keys: sub("").keys }))).status).toBe(400);
    expect((await POST(req("POST", { endpoint }))).status).toBe(400);
  });

  it("guarda el dispositivo; si otra persona inicia sesión en ese navegador, pasa a ella", async () => {
    authMock.mockResolvedValue(fakeSession({ id: a.id, role: "AGENT", organizationId: org.id }));
    expect((await POST(req("POST", sub(endpoint)))).status).toBe(200);
    expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).userId).toBe(a.id);
    authMock.mockResolvedValue(fakeSession({ id: b.id, role: "OWNER", organizationId: org.id }));
    expect((await POST(req("POST", sub(endpoint)))).status).toBe(200);
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(1);
    expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint } })).userId).toBe(b.id);
  });

  it("solo su dueño lo da de baja", async () => {
    authMock.mockResolvedValue(fakeSession({ id: a.id, role: "AGENT", organizationId: org.id }));
    await DELETE(req("DELETE", { endpoint }));
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(1);
    authMock.mockResolvedValue(fakeSession({ id: b.id, role: "OWNER", organizationId: org.id }));
    await DELETE(req("DELETE", { endpoint }));
    expect(await prisma.pushSubscription.count({ where: { endpoint } })).toBe(0);
  });
});
