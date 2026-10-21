// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupAgentFixture } from "@/test/ai-agents-helpers";
import { prisma } from "@/lib/prisma";
import { createTestOrg } from "@/test/helpers";
import { getCenterArticles, getCenterChannelActivity, getCenterConversations, getCenterExecutions, pageNumber } from "./center-data";

describe("Phase 2 tenant-scoped read models", () => {
  const ids: string[] = [];
  const org = async () => { const x = await createTestOrg("Phase2 readers"); ids.push(x.id); return x; };
  beforeEach(() => vi.stubEnv("AI_AGENT_MODEL_ENABLED", "false"));
  afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const id of ids.splice(0)) await cleanupAgentFixture(id); });
  it("counts every open conversation across channels instead of the five recent rows", async () => {
    const a = await org(), b = await org();
    for (let i = 0; i < 12; i++) await prisma.conversation.create({ data: { organizationId: a.id, channel: i % 2 ? "whatsapp" : "instagram" } });
    await prisma.conversation.create({ data: { organizationId: a.id, channel: "email", status: "ESCALATED" } });
    await prisma.conversation.create({ data: { organizationId: a.id, channel: "whatsapp", status: "OPEN", archivedAt: new Date() } });
    await prisma.conversation.create({ data: { organizationId: b.id, channel: "email", status: "ESCALATED", contactName: "Foreign" } });
    const result = await getCenterConversations(a.id);
    expect(result).toMatchObject({ total: 14, open: 12, human: 1 }); expect(result.recent).toHaveLength(5);
    expect(JSON.stringify(result)).not.toContain("Foreign");
  });
  it("article search, categories and pagination remain bounded and tenant scoped beyond a single page", async () => {
    const a = await org(), b = await org();
    await prisma.knowledgeBase.createMany({ data: Array.from({ length: 23 }, (_, i) => ({ organizationId: a.id, title: `Horario ${i}`, content: "Abierto", category: i % 2 ? "FAQ" : "Otros", tags: [], isActive: i !== 0 })) });
    await prisma.knowledgeBase.create({ data: { organizationId: b.id, title: "Horario privado", content: "Foreign", category: "Privado", tags: [] } });
    const first = await getCenterArticles(a.id, {}), second = await getCenterArticles(a.id, { page: "2" }), last = await getCenterArticles(a.id, { page: "99999" });
    expect(first).toMatchObject({ total: 23, active: 22, page: 1, pages: 3 }); expect(first.rows).toHaveLength(10); expect(second.rows).toHaveLength(10); expect(last.rows).toHaveLength(3);
    expect(new Set([...first.rows, ...second.rows, ...last.rows].map(r => r.id)).size).toBe(23);
    expect(first.categories).not.toContain("Privado");
    expect((await getCenterArticles(a.id, { q: "HORARIO", category: "FAQ" })).total).toBe(11);
    expect((await getCenterArticles(a.id, { q: "no existe" })).total).toBe(0);
  });
  it("received activity excludes outbound messages, other tenants and other channels", async () => {
    const a = await org(), b = await org();
    const conv = await prisma.conversation.create({ data: { organizationId: a.id, channel: "whatsapp" } });
    await prisma.message.create({ data: { conversationId: conv.id, role: "ASSISTANT", content: "Outbound" } });
    const other = await prisma.conversation.create({ data: { organizationId: b.id, channel: "instagram" } });
    await prisma.message.create({ data: { conversationId: other.id, role: "USER", content: "Foreign" } });
    let activity = await getCenterChannelActivity(a.id); expect(activity.every(r => r.receivedAt === null)).toBe(true);
    const inbound = await prisma.message.create({ data: { conversationId: conv.id, role: "USER", content: "Hi" } });
    activity = await getCenterChannelActivity(a.id);
    expect(activity.find(r => r.channel === "whatsapp")?.receivedAt).toEqual(inbound.createdAt);
    expect(activity.find(r => r.channel === "instagram")?.receivedAt).toBeNull();
    expect(JSON.stringify(activity)).not.toMatch(/Operational|Connected|Foreign|Outbound/);
  });
  it("model off never queries a new table; failed queries are not presented as empty or zero", async () => {
    const a = await org(); const lookup = vi.spyOn(prisma.agentExecution, "count");
    expect(await getCenterExecutions(a.id, "2")).toMatchObject({ available: false, rows: [], total: 0 }); expect(lookup).not.toHaveBeenCalled();
    vi.spyOn(prisma.conversation, "count").mockRejectedValueOnce(new Error("database unavailable"));
    await expect(getCenterConversations(a.id)).rejects.toThrow("database unavailable");
  });
  it("execution pagination excludes other tenants and private configuration", async () => {
    vi.stubEnv("AI_AGENT_MODEL_ENABLED", "true"); const a = await org(), b = await org();
    await prisma.agentDefinition.upsert({ where: { key_version: { key: "phase2-fixture", version: 1 } }, create: { key: "phase2-fixture", version: 1, displayName: "Fixture", specialty: "fixture", manifest: {} }, update: {} });
    for (const tenant of [a, b]) {
      const instance = await prisma.agentInstance.create({ data: { organizationId: tenant.id, definitionKey: "phase2-fixture", definitionVersion: 1, publicName: "Fixture" } });
      await prisma.agentConfigRevision.create({ data: { organizationId: tenant.id, agentInstanceId: instance.id, version: 1, sourceHash: "fixture", snapshot: { private: "never show this" } } });
      await prisma.agentExecution.createMany({ data: Array.from({ length: tenant.id === a.id ? 25 : 1 }, (_, i) => ({ organizationId: tenant.id, agentInstanceId: instance.id, configVersion: 1, conversationId: "fixture", messageId: `fixture-${i}`, operation: "fixture", legacyJobId: `fixture-${tenant.id}-${i}` })) });
    }
    const first = await getCenterExecutions(a.id, "1"), last = await getCenterExecutions(a.id, "9999");
    expect(first).toMatchObject({ available: true, total: 25, page: 1, pages: 3 }); expect(first.rows).toHaveLength(10); expect(last.rows).toHaveLength(5);
    expect(JSON.stringify(first)).not.toContain(b.id); expect(JSON.stringify(first)).not.toContain("never show this");
  });
  it("normalizes invalid pagination without trusting repeated/negative/unbounded input", () => {
    for (const raw of [undefined, "-2", "Infinity", ["2"], "1.1", "NaN", "9999999999999999999999"]) expect(pageNumber(raw)).toBe(1);
    expect(pageNumber("0")).toBe(1); expect(pageNumber("99999")).toBe(99999);
  });
});
