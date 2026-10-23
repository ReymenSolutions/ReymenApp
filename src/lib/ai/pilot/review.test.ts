// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { preparePrivateMark } from "./admin";
import { configurePilotBudget } from "./budget";
import { assignPrivatePilotSource, runPrivateMarkReview } from "./review";
import { lockKnowledge, bumpKnowledge } from "../knowledge/service";
const mocks = vi.hoisted(() => ({ call: vi.fn(), fx: vi.fn() }));
vi.mock("../providers/anthropic-pilot", () => ({ callAnthropicPilot: mocks.call }));
vi.mock("@/lib/exchange-rate", () => ({ getMxnPerUsdRate: mocks.fx }));
const orgs: string[] = [], admins: string[] = [], model = "private-review-fixture-model";
const request = () => ({ requestKey: randomUUID(), question: "¿Cuál es el horario ficticio?", confirmFictional: true as const, confirmCost: true as const });
const response = () => ({ text: "Horario ficticio: 9 a 18.", modelServed: model, externalId: `msg_${randomUUID()}`, usage: { inputTokens: 20, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 } });
async function fixture(assign = true) {
  const org = await createTestOrg("Private review"); orgs.push(org.id);
  const owner = await createTestUser(org.id, "OWNER", "review-owner");
  const admin = await createTestUser(null, "SUPER_ADMIN", "review-admin"); admins.push(admin.id);
  await prisma.aiBudgetSetting.create({ data: { organizationId: org.id, monthlyBudgetMxn: 100 } });
  const mark = await preparePrivateMark(org.id, admin.id);
  const article = await prisma.knowledgeBase.create({ data: { organizationId: org.id, title: "Horario ficticio", content: "Horario ficticio de lunes a viernes de 9 a 18.", tags: ["horario"], knowledgeVersion: 1 } });
  await prisma.knowledgeRevision.create({ data: { organizationId: org.id, articleId: article.id, version: 1, title: article.title, content: article.content, tags: article.tags, sourceHash: "fixture", publishedAt: new Date() } });
  if (assign) await assignPrivatePilotSource(org.id, admin.id, { articleId: article.id, version: 1, policyVersion: 0 });
  await configurePilotBudget(org.id, admin.id, true, 1);
  return { org, owner, admin, mark, article };
}
beforeEach(async () => {
  for (const name of ["REYMEN_STAGING", "AI_MARK_PRIVATE_REVIEW_ENABLED", "AI_KNOWLEDGE_ACCESS_ENABLED", "AI_MARK_PILOT_GATEWAY_ENABLED", "AI_MARK_PILOT_BUDGET_ENABLED"]) vi.stubEnv(name, "true");
  vi.stubEnv("AI_MARK_PILOT_MODEL", model); vi.stubEnv("AI_MARK_PILOT_ANTHROPIC_API_KEY", "synthetic-key");
  mocks.call.mockReset().mockImplementation(async () => response()); mocks.fx.mockReset().mockResolvedValue({ rate: 20, source: "env", date: null });
  await prisma.aiRate.create({ data: { provider: "anthropic", model, currency: "USD", inputPerMTok: 2, outputPerMTok: 10, effectiveFrom: new Date("2020-01-01Z"), source: "test-private-review" } });
});
afterEach(async () => {
  vi.unstubAllEnvs(); vi.restoreAllMocks();
  for (const organizationId of orgs.splice(0)) {
    await prisma.knowledgeGrant.deleteMany({ where: { organizationId } });
    await prisma.aiUsage.deleteMany({ where: { organizationId } }); await prisma.aiPilotBudgetRoot.deleteMany({ where: { organizationId } });
    await prisma.agentConfigRevision.deleteMany({ where: { organizationId } }); await prisma.agentInstance.deleteMany({ where: { organizationId } });
    await cleanupOrg(organizationId);
  }
  await prisma.user.deleteMany({ where: { id: { in: admins.splice(0) } } });
  await prisma.aiRate.deleteMany({ where: { source: "test-private-review" } });
});
it("uses only published Mark grants, attributes one paid step and closes unused capacity without a sender", async () => {
  const f = await fixture();
  await prisma.knowledgeBase.create({ data: { organizationId: f.org.id, title: "Secret draft", content: "UNAUTHORIZED_SOURCE", tags: [] } });
  const result = await runPrivateMarkReview(f.org.id, f.owner.id, request());
  expect(result.kind).toBe("draft"); expect(result.sources).toMatchObject([{ articleId: f.article.id, version: 1 }]);
  expect(mocks.call).toHaveBeenCalledTimes(1);
  expect(mocks.call.mock.calls[0][0].system).toContain("9 a 18"); expect(mocks.call.mock.calls[0][0].system).not.toContain("UNAUTHORIZED_SOURCE");
  expect(await prisma.aiPilotBudgetRoot.findFirst({ where: { organizationId: f.org.id } })).toMatchObject({ state: "CLOSED", agentInstanceId: f.mark.instanceId });
  const row = await prisma.aiUsage.findFirstOrThrow({ where: { organizationId: f.org.id } });
  expect(Number(row.costMxn)).toBe(0.0048); expect(JSON.stringify(row)).not.toContain("¿Cuál es");
  expect(await prisma.conversation.count({ where: { organizationId: f.org.id } })).toBe(0);
  expect(await prisma.customer.count({ where: { organizationId: f.org.id } })).toBe(0);
});
it("does not call the provider without matching sources or accepted fictional/cost confirmations", async () => {
  const f = await fixture();
  expect((await runPrivateMarkReview(f.org.id, f.owner.id, { ...request(), question: "zqxvnotmatching" })).kind).toBe("no_sources");
  await expect(runPrivateMarkReview(f.org.id, f.owner.id, { ...request(), confirmCost: false } as never)).rejects.toThrow();
  await expect(runPrivateMarkReview(f.org.id, f.owner.id, { ...request(), confirmFictional: false } as never)).rejects.toThrow();
  expect(mocks.call).not.toHaveBeenCalled(); expect(await prisma.aiPilotBudgetRoot.count({ where: { organizationId: f.org.id } })).toBe(0);
});
it("rejects unpublished, foreign and stale source assignments and non-admin writers", async () => {
  const f = await fixture(false), other = await fixture(false);
  await expect(assignPrivatePilotSource(f.org.id, f.owner.id, { articleId: f.article.id, version: 1, policyVersion: 0 })).rejects.toThrow(/forbidden/);
  await expect(assignPrivatePilotSource(f.org.id, f.admin.id, { articleId: other.article.id, version: 1, policyVersion: 0 })).rejects.toThrow(/published/);
  await expect(assignPrivatePilotSource(f.org.id, f.admin.id, { articleId: f.article.id, version: 2, policyVersion: 0 })).rejects.toThrow(/published/);
  await assignPrivatePilotSource(f.org.id, f.admin.id, { articleId: f.article.id, version: 1, policyVersion: 0 });
  await expect(assignPrivatePilotSource(f.org.id, f.admin.id, { articleId: f.article.id, version: 1, policyVersion: 0 })).rejects.toThrow(/changed/);
  expect(mocks.call).not.toHaveBeenCalled();
});
it("denies foreign actors and revoked roles and fails closed when review or knowledge is disabled", async () => {
  const f = await fixture(), other = await fixture();
  await expect(runPrivateMarkReview(f.org.id, other.owner.id, request())).rejects.toThrow(/autorizado/);
  for (const role of ["VIEWER", "AGENT", "CLIENT"] as const) {
    await prisma.user.update({ where: { id: f.owner.id }, data: { role } });
    await expect(runPrivateMarkReview(f.org.id, f.owner.id, request())).rejects.toThrow(/autorizado/);
  }
  vi.stubEnv("AI_MARK_PRIVATE_REVIEW_ENABLED", "false");
  await expect(runPrivateMarkReview(f.org.id, f.owner.id, request())).rejects.toThrow(/disabled/);
  vi.stubEnv("AI_MARK_PRIVATE_REVIEW_ENABLED", "true"); vi.stubEnv("AI_KNOWLEDGE_ACCESS_ENABLED", "false");
  await expect(runPrivateMarkReview(f.org.id, f.owner.id, request())).rejects.toThrow(/disabled/);
  expect(mocks.call).not.toHaveBeenCalled();
});
it("concurrent requests with one key dispatch at most once and cannot replay after completion", async () => {
  const f = await fixture(), input = request();
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => runPrivateMarkReview(f.org.id, f.owner.id, input)));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(mocks.call).toHaveBeenCalledTimes(1);
  await expect(runPrivateMarkReview(f.org.id, f.owner.id, input)).rejects.toThrow(/already_started/);
  expect(mocks.call).toHaveBeenCalledTimes(1);
});
it("revocation during generation accounts the cost but withholds the late draft", async () => {
  const f = await fixture();
  mocks.call.mockImplementationOnce(async () => {
    await prisma.$transaction(async tx => { await lockKnowledge(tx, f.org.id); await tx.knowledgeGrant.updateMany({ where: { organizationId: f.org.id }, data: { enabled: false } }); await bumpKnowledge(tx, f.org.id); });
    return response();
  });
  await expect(runPrivateMarkReview(f.org.id, f.owner.id, request())).rejects.toThrow(/sources_changed/);
  expect((await prisma.aiUsage.findFirstOrThrow({ where: { organizationId: f.org.id } })).status).toBe("SUCCEEDED");
  expect(await prisma.conversation.count({ where: { organizationId: f.org.id } })).toBe(0);
});
it("provider ambiguity retains the reservation and pauses admission without retrying", async () => {
  const f = await fixture(); mocks.call.mockRejectedValueOnce(new Error("synthetic timeout"));
  await expect(runPrivateMarkReview(f.org.id, f.owner.id, request())).rejects.toThrow(/uncertain/);
  const root = await prisma.aiPilotBudgetRoot.findFirstOrThrow({ where: { organizationId: f.org.id } });
  expect(root.state).toBe("UNCERTAIN"); expect(Number(root.holdMxn)).toBe(1);
  expect((await prisma.aiPilotBudgetPolicy.findUniqueOrThrow({ where: { organizationId: f.org.id } })).enabled).toBe(false);
  expect(mocks.call).toHaveBeenCalledTimes(1);
});
