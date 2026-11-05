// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";

import webpush from "web-push";

const KEYS = webpush.generateVAPIDKeys();
const sent: { endpoint: string; payload: Record<string, string> }[] = [];
const { sendPushToUsers, notifyInboundMessage, notifyNewLead, setPushSenderForTests, resetPushConfigForTests } = await import("./push");

describe("Notificaciones push", () => {
  let org: { id: string };
  let owner: { id: string };
  let agent: { id: string };
  let viewer: { id: string };

  beforeAll(async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", KEYS.publicKey);
    vi.stubEnv("VAPID_PRIVATE_KEY", KEYS.privateKey);
    resetPushConfigForTests();
    setPushSenderForTests(async (sub, payload) => {
      if (sub.endpoint.includes("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (sub.endpoint.includes("flaky")) throw Object.assign(new Error("boom"), { statusCode: 500 });
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    });
    org = await createTestOrg("Push Org");
    owner = await createTestUser(org.id, "OWNER", "push-owner");
    agent = await createTestUser(org.id, "AGENT", "push-agent");
    viewer = await createTestUser(org.id, "VIEWER", "push-viewer");
    const sub = (userId: string, name: string) => prisma.pushSubscription.create({ data: { userId, endpoint: `https://push.test/${name}-${org.id}`, p256dh: "p256dh-key-xxxx", auth: "auth-key-xx" } });
    await sub(owner.id, "owner");
    await sub(agent.id, "agent");
    await sub(agent.id, "gone");
    await sub(agent.id, "flaky");
    await sub(viewer.id, "viewer");
  });
  afterAll(async () => {
    setPushSenderForTests(null);
    vi.unstubAllEnvs();
    resetPushConfigForTests();
    await prisma.pushSubscription.deleteMany({ where: { user: { organizationId: org.id } } });
    await cleanupOrg(org.id);
  });

  it("manda a cada dispositivo, borra los que ya no existen y cuenta fallas pasajeras", async () => {
    sent.length = 0;
    const out = await sendPushToUsers([agent.id], { title: "Hola", url: "/portal/tasks" });
    expect(out).toEqual({ sent: 1, removed: 1 });
    expect(sent[0].payload).toMatchObject({ title: "Hola", url: "/portal/tasks" });
    expect(await prisma.pushSubscription.count({ where: { endpoint: { contains: "gone" }, userId: agent.id } })).toBe(0);
    expect((await prisma.pushSubscription.findFirstOrThrow({ where: { endpoint: { contains: "flaky" }, userId: agent.id } })).failures).toBe(1);
  });

  it("mensaje nuevo sin responsable: a quienes atienden (no al Visor); con responsable: solo a él", async () => {
    const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "instagram", contactHandle: "ig1", contactName: "Ana", lastMessagePreview: "¿Precio?" } });
    sent.length = 0;
    await notifyInboundMessage(org.id, conv.id);
    const to = sent.map((s) => s.endpoint);
    expect(to.some((e) => e.includes("owner"))).toBe(true);
    expect(to.some((e) => e.includes("/agent-"))).toBe(true);
    expect(to.some((e) => e.includes("viewer"))).toBe(false);
    expect(sent[0].payload).toMatchObject({ title: "Ana · Instagram", body: "¿Precio?", url: `/portal/conversations/${conv.id}`, tag: `conv:${conv.id}` });

    await prisma.conversation.update({ where: { id: conv.id }, data: { assignedToId: owner.id } });
    sent.length = 0;
    await notifyInboundMessage(org.id, conv.id);
    expect(sent.map((s) => s.endpoint).every((e) => e.includes("owner"))).toBe(true);
  });

  it("lead nuevo: a dueño, admin y gerentes", async () => {
    sent.length = 0;
    await notifyNewLead(org.id, { id: "l1", name: "Lucía", source: "Meta Lead Ads" });
    expect(sent.map((s) => s.endpoint).every((e) => e.includes("owner"))).toBe(true);
    expect(sent[0].payload).toMatchObject({ title: "Nuevo lead: Lucía", body: "Llegó por Meta Lead Ads" });
  });

  it("sin llaves VAPID no hace nada", async () => {
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    resetPushConfigForTests();
    sent.length = 0;
    expect(await sendPushToUsers([owner.id], { title: "x" })).toEqual({ sent: 0, removed: 0 });
    vi.stubEnv("VAPID_PRIVATE_KEY", KEYS.privateKey);
    resetPushConfigForTests();
  });
});
