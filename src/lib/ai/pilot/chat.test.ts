// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { preparePrivateMark } from "./admin";
import { configurePilotBudget, reservePilotRoot, beginPilotRoot } from "./budget";
import { assignPrivatePilotSource } from "./review";
import { lockKnowledge, bumpKnowledge } from "../knowledge/service";
import { configurePrivateChatMode, processPrivateChatJob, recoverPrivateChatJobs, assertPrivateChatViewer, createPrivateChat, postPrivateVisitor, readPrivateVisitor, generatePrivateChatDraft, sendPrivateChatReply, controlPrivateChat, readPrivateChatOperator, recoverPrivateChat, renewPrivateChatLink } from "./chat";
import { sendConversationOutbound } from "@/lib/channel-connections/outbound";
import { getOrCreateReplyDraft } from "@/lib/ai-draft";
import { runAutoReply } from "@/lib/ai-auto-reply";

const mocks = vi.hoisted(() => ({ call: vi.fn(), fx: vi.fn(), send: vi.fn() }));
vi.mock("../providers/anthropic-pilot", () => ({ callAnthropicPilot: mocks.call }));
vi.mock("@/lib/exchange-rate", () => ({ getMxnPerUsdRate: mocks.fx }));
vi.mock("@/lib/n8n", () => ({ triggerN8nWorkflow: mocks.send }));
const orgs: string[] = [], admins: string[] = [], model = "mark-chat-fixture";
const response = () => ({ text: "El horario ficticio es de 9 a 18.", modelServed: model, externalId: `msg_${randomUUID()}`, usage: { inputTokens: 20, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 } });
async function fixture() {
  const org = await createTestOrg("Private chat fixture"); orgs.push(org.id);
  const owner = await createTestUser(org.id, "OWNER", "mark-chat-owner");
  const admin = await createTestUser(null, "SUPER_ADMIN", "mark-chat-admin"); admins.push(admin.id);
  await prisma.aiBudgetSetting.create({ data: { organizationId: org.id, monthlyBudgetMxn: 100 } });
  const mark = await preparePrivateMark(org.id, admin.id);
  const article = await prisma.knowledgeBase.create({ data: { organizationId: org.id, title: "Horario ficticio", content: "Horario ficticio de 9 a 18.", tags: ["horario"], knowledgeVersion: 1 } });
  await prisma.knowledgeRevision.create({ data: { organizationId: org.id, articleId: article.id, version: 1, title: article.title, content: article.content, tags: article.tags, sourceHash: "fixture", publishedAt: new Date() } });
  await assignPrivatePilotSource(org.id, admin.id, { articleId: article.id, version: 1, policyVersion: 0 });
  await configurePilotBudget(org.id, admin.id, true, 1);
  const chat = await createPrivateChat(org.id, owner.id, { requestKey: randomUUID(), confirmFictional: true });
  const token = new URLSearchParams(new URL(chat.visitorUrl!).hash.slice(1)).get("token")!;
  return { org, owner, admin, mark, article, chat, token };
}
const inbound = (f: Awaited<ReturnType<typeof fixture>>, content = "¿Cuál es el horario ficticio?") => postPrivateVisitor(f.token, { requestKey: randomUUID(), content });
const generate = (f: Awaited<ReturnType<typeof fixture>>, messageId: string) => generatePrivateChatDraft(f.org.id, f.owner.id, f.chat.conversationId, messageId, true);
beforeEach(async () => {
  for (const key of ["REYMEN_STAGING", "AI_MARK_PRIVATE_CHAT_ENABLED", "AI_MARK_PRIVATE_REVIEW_ENABLED", "AI_KNOWLEDGE_ACCESS_ENABLED", "AI_MARK_PILOT_GATEWAY_ENABLED", "AI_MARK_PILOT_BUDGET_ENABLED"]) vi.stubEnv(key, "true");
  vi.stubEnv("AI_MARK_PILOT_MODEL", model); vi.stubEnv("AI_MARK_PILOT_ANTHROPIC_API_KEY", "synthetic-key"); vi.stubEnv("AI_MARK_PILOT_PROXY_URL", "");
  mocks.call.mockReset().mockImplementation(async () => response()); mocks.fx.mockReset().mockResolvedValue({ rate: 20, date: null, source: "env" }); mocks.send.mockReset().mockResolvedValue({ success: true });
  await prisma.aiRate.create({ data: { provider: "anthropic", model, currency: "USD", inputPerMTok: 2, outputPerMTok: 10, effectiveFrom: new Date("2020-01-01Z"), source: "test-mark-chat" } });
});
afterEach(async () => {
  vi.unstubAllEnvs(); vi.restoreAllMocks();
  for (const organizationId of orgs.splice(0)) {
    await prisma.markChatSettings.deleteMany({ where: { organizationId } });
    await prisma.markChatTurn.deleteMany({ where: { organizationId } }); await prisma.markChatPilot.deleteMany({ where: { organizationId } });
    await prisma.aiUsage.deleteMany({ where: { organizationId } }); await prisma.aiPilotBudgetRoot.deleteMany({ where: { organizationId } });
    await prisma.knowledgeGrant.deleteMany({ where: { organizationId } }); await prisma.agentConfigRevision.deleteMany({ where: { organizationId } }); await prisma.agentInstance.deleteMany({ where: { organizationId } });
    await cleanupOrg(organizationId);
  }
  await prisma.user.deleteMany({ where: { id: { in: admins.splice(0) } } }); await prisma.aiRate.deleteMany({ where: { source: "test-mark-chat" } });
});

it("stores only a hash of the expiring capability and deduplicates conversation creation", async () => {
  const f = await fixture(), input = { requestKey: randomUUID(), confirmFictional: true };
  const first = await createPrivateChat(f.org.id, f.owner.id, input), duplicate = await createPrivateChat(f.org.id, f.owner.id, input);
  expect(duplicate.conversationId).toBe(first.conversationId); expect(duplicate.visitorUrl).toBeNull();
  const row = await prisma.markChatPilot.findUniqueOrThrow({ where: { conversationId: f.chat.conversationId } });
  expect(row.tokenHash).toHaveLength(64); expect(JSON.stringify(row)).not.toContain(f.token);
  expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeLessThanOrEqual(3600100);
  await expect(readPrivateVisitor("A".repeat(43))).rejects.toThrow(/unavailable/);
  expect(mocks.call).not.toHaveBeenCalled();
});
it("deduplicates visitor messages and never generates or exposes a draft while receiving/polling", async () => {
  const f = await fixture(), input = { requestKey: randomUUID(), content: "horario ficticio" };
  const [a, b] = await Promise.all([postPrivateVisitor(f.token, input), postPrivateVisitor(f.token, input)]);
  expect(a.id).toBe(b.id); expect((await readPrivateVisitor(f.token)).messages).toHaveLength(1);
  await expect(postPrivateVisitor(f.token, { ...input, content: "otro texto" })).rejects.toThrow(/key_conflict/);
  expect(mocks.call).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
});
it("routes a request for a person to the human queue with no provider call or charge", async () => {
  const f = await fixture(), message = await inbound(f, "Quiero hablar con una persona");
  const visitor = await readPrivateVisitor(f.token);
  expect(visitor).toMatchObject({ status: "ESCALATED", human: true });
  await expect(generate(f, message.id)).rejects.toThrow(/human_control/);
  expect(await prisma.aiUsage.count({ where: { organizationId: f.org.id } })).toBe(0); expect(mocks.call).not.toHaveBeenCalled();
  const agent = await createTestUser(f.org.id, "AGENT", "chat-agent");
  await sendPrivateChatReply(f.org.id, agent.id, { conversationId: f.chat.conversationId, content: "Hola, soy la persona que te atenderá.", requestKey: randomUUID() });
  expect((await readPrivateVisitor(f.token)).messages.at(-1)?.role).toBe("AGENT"); expect(mocks.send).not.toHaveBeenCalled();
});
it("persists a reviewed draft and cost, then delivers once through the private sender after human approval", async () => {
  const f = await fixture(), message = await inbound(f); await generate(f, message.id);
  const state = await readPrivateChatOperator(f.org.id, f.owner.id, f.chat.conversationId);
  expect(state.turn).toMatchObject({ status: "READY", costMxn: "0.0048", sources: [{ articleId: f.article.id, version: 1 }] });
  expect((await readPrivateVisitor(f.token)).messages).toHaveLength(1);
  const reply = { conversationId: f.chat.conversationId, draftId: state.turn!.draftId, requestKey: randomUUID(), content: "Horario revisado: de 9 a 18." };
  const a = await sendPrivateChatReply(f.org.id, f.owner.id, reply), b = await sendPrivateChatReply(f.org.id, f.owner.id, reply);
  expect(a.message.id).toBe(b.message.id);
  expect((await readPrivateVisitor(f.token)).messages.map(m => m.role)).toEqual(["USER", "AGENT"]);
  expect(await prisma.replyDraft.findUnique({ where: { id: state.turn!.draftId } })).toMatchObject({ status: "USED", finalContent: reply.content, usedById: f.owner.id });
  await expect(sendPrivateChatReply(f.org.id, f.owner.id, { ...reply, requestKey: randomUUID() })).rejects.toThrow(/stale/);
  expect(mocks.call).toHaveBeenCalledTimes(1); expect(mocks.send).not.toHaveBeenCalled();
});
it("admits only one concurrent generation and one concurrent approval for the same turn", async () => {
  const f = await fixture(), message = await inbound(f);
  const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => generate(f, message.id)));
  expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(mocks.call).toHaveBeenCalledTimes(1);
  const draft = await prisma.replyDraft.findFirstOrThrow({ where: { conversationId: f.chat.conversationId } });
  const sends = await Promise.allSettled(Array.from({ length: 3 }, () => sendPrivateChatReply(f.org.id, f.owner.id, { conversationId: f.chat.conversationId, draftId: draft.id, content: draft.content, requestKey: randomUUID() })));
  expect(sends.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(await prisma.message.count({ where: { conversationId: f.chat.conversationId, role: "AGENT" } })).toBe(1);
});
it("taking and releasing human control during generation fences the late result while preserving its cost", async () => {
  const f = await fixture(), message = await inbound(f);
  mocks.call.mockImplementationOnce(async () => {
    await controlPrivateChat(f.org.id, f.owner.id, f.chat.conversationId, "take");
    await controlPrivateChat(f.org.id, f.owner.id, f.chat.conversationId, "release");
    return response();
  });
  await expect(generate(f, message.id)).rejects.toThrow(/stopped/);
  expect(await prisma.replyDraft.findFirst({ where: { conversationId: f.chat.conversationId } })).toMatchObject({ status: "DISMISSED", content: "" });
  expect((await prisma.aiUsage.findFirstOrThrow({ where: { organizationId: f.org.id } })).status).toBe("SUCCEEDED");
  expect((await readPrivateVisitor(f.token)).messages).toHaveLength(1);
});
it("a new visitor message during generation prevents the old draft from being stored or sent", async () => {
  const f = await fixture(), message = await inbound(f);
  mocks.call.mockImplementationOnce(async () => { await inbound(f, "Otro mensaje ficticio"); return response(); });
  await expect(generate(f, message.id)).rejects.toThrow(/stopped/);
  expect((await readPrivateChatOperator(f.org.id, f.owner.id, f.chat.conversationId)).turn).toBeNull();
  expect((await readPrivateVisitor(f.token)).messages).toHaveLength(2);
});
it("revalidates the conversation at financial admission before a provider call after a slow quote", async () => {
  const f = await fixture(), message = await inbound(f);
  mocks.fx.mockImplementationOnce(async () => { await inbound(f, "Mensaje nuevo antes del despacho"); return { rate: 20, source: "env", date: null }; });
  await expect(generate(f, message.id)).rejects.toThrow(/stopped/);
  expect(mocks.call).not.toHaveBeenCalled(); expect(await prisma.aiUsage.count({ where: { organizationId: f.org.id } })).toBe(0);
  expect((await prisma.aiPilotBudgetRoot.findFirstOrThrow({ where: { organizationId: f.org.id } })).state).toBe("CLOSED");
});
it("revoked knowledge or human takeover after READY blocks approval without changing recorded spend", async () => {
  const f = await fixture(), message = await inbound(f); await generate(f, message.id);
  const draft = await prisma.replyDraft.findFirstOrThrow({ where: { conversationId: f.chat.conversationId } });
  await prisma.$transaction(async tx => { await lockKnowledge(tx, f.org.id); await tx.knowledgeGrant.updateMany({ where: { organizationId: f.org.id }, data: { enabled: false } }); await bumpKnowledge(tx, f.org.id); });
  await expect(sendPrivateChatReply(f.org.id, f.owner.id, { conversationId: f.chat.conversationId, draftId: draft.id, requestKey: randomUUID(), content: draft.content })).rejects.toThrow(/sources_changed/);
  expect((await readPrivateChatOperator(f.org.id, f.owner.id, f.chat.conversationId)).turn).toMatchObject({ status: "DISMISSED", content: "" });
  expect((await prisma.aiUsage.findFirstOrThrow({ where: { organizationId: f.org.id } })).costMxn?.toString()).toBe("0.0048");
  expect((await readPrivateVisitor(f.token)).messages).toHaveLength(1);
});
it("refuses cross-organization reads/writes and stale or unprivileged operators", async () => {
  const f = await fixture(), other = await fixture();
  await expect(readPrivateChatOperator(other.org.id, other.owner.id, f.chat.conversationId)).rejects.toThrow(/unavailable/);
  await expect(sendPrivateChatReply(other.org.id, other.owner.id, { conversationId: f.chat.conversationId, content: "hola", requestKey: randomUUID() })).rejects.toThrow(/unavailable/);
  const viewer = await createTestUser(f.org.id, "VIEWER", "chat-viewer");
  await expect(controlPrivateChat(f.org.id, viewer.id, f.chat.conversationId, "take")).rejects.toThrow(/forbidden/);
  await expect(sendPrivateChatReply(f.org.id, viewer.id, { conversationId: f.chat.conversationId, content: "hola", requestKey: randomUUID() })).rejects.toThrow(/forbidden/);
  await prisma.user.update({ where: { id: f.owner.id }, data: { isActive: false } });
  await expect(readPrivateVisitor(f.token)).rejects.toThrow(/forbidden/);
  expect(mocks.call).not.toHaveBeenCalled();
});
it("keeps legacy generation and n8n transport out of the private conversation", async () => {
  const f = await fixture(); await inbound(f);
  expect(await getOrCreateReplyDraft(f.org.id, f.chat.conversationId)).toEqual({ state: "off" });
  await prisma.agentChannelSetting.create({ data: { organizationId: f.org.id, channel: "webchat", mode: "AUTO" } });
  expect(await runAutoReply(f.org.id, f.chat.conversationId)).toBe("skipped");
  await expect(prisma.$transaction(tx => sendConversationOutbound(tx, f.org.id, { id: f.chat.conversationId, channel: "webchat", channelConnectionId: null }, "not-a-message", {}))).rejects.toThrow(/privado/);
  expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.call).not.toHaveBeenCalled();
});
it("renews/revokes capabilities without deleting the conversation and invalidates old keys", async () => {
  const f = await fixture(); await inbound(f);
  const renewed = await renewPrivateChatLink(f.org.id, f.owner.id, f.chat.conversationId);
  await expect(readPrivateVisitor(f.token)).rejects.toThrow(/unavailable/);
  const newToken = new URLSearchParams(new URL(renewed.visitorUrl).hash.slice(1)).get("token")!;
  expect((await readPrivateVisitor(newToken)).messages).toHaveLength(1);
  await controlPrivateChat(f.org.id, f.owner.id, f.chat.conversationId, "revoke");
  await expect(readPrivateVisitor(newToken)).rejects.toThrow(/unavailable/);
  expect(await prisma.conversation.count({ where: { id: f.chat.conversationId } })).toBe(1);
});
it("provider ambiguity pauses admission and never sends or retries the missing response", async () => {
  const f = await fixture(), message = await inbound(f); mocks.call.mockRejectedValueOnce(new Error("synthetic timeout"));
  await expect(generate(f, message.id)).rejects.toThrow(/stopped/);
  expect((await prisma.aiPilotBudgetRoot.findFirstOrThrow({ where: { organizationId: f.org.id } })).state).toBe("UNCERTAIN");
  expect((await prisma.aiPilotBudgetPolicy.findUniqueOrThrow({ where: { organizationId: f.org.id } })).enabled).toBe(false);
  await expect(generate(f, message.id)).rejects.toThrow(/human_control/); expect(mocks.call).toHaveBeenCalledTimes(1);
  expect((await readPrivateVisitor(f.token)).messages).toHaveLength(1);
});
it("recovers an abandoned GENERATING turn to human review without releasing an unknown financial hold", async () => {
  const f = await fixture(), message = await inbound(f), requestKey = randomUUID();
  const draft = await prisma.replyDraft.create({ data: { organizationId: f.org.id, conversationId: f.chat.conversationId, basedOnMessageId: message.id, createdAt: new Date(Date.now() - 360000) } });
  await prisma.markChatTurn.create({ data: { organizationId: f.org.id, conversationId: f.chat.conversationId, basedOnMessageId: message.id, draftId: draft.id, generatedById: f.owner.id, requestKey, expectedRevision: 2 } });
  const root = await reservePilotRoot(f.org.id, f.owner.id, requestKey); await beginPilotRoot(f.org.id, f.owner.id, root.id);
  await prisma.aiPilotBudgetRoot.update({ where: { id: root.id }, data: { state: "UNCERTAIN" } });
  expect(await recoverPrivateChat(f.org.id, f.owner.id, f.chat.conversationId)).toEqual({ recovered: 1 });
  expect(await prisma.replyDraft.findUnique({ where: { id: draft.id } })).toMatchObject({ status: "FAILED" });
  const retained = await prisma.aiPilotBudgetRoot.findUniqueOrThrow({ where: { id: root.id } });
  expect(retained.state).toBe("UNCERTAIN"); expect(Number(retained.holdMxn)).toBe(1); expect(mocks.call).not.toHaveBeenCalled();
});
it("expired sessions, disabled features and missing consent cannot create effects", async () => {
  const f = await fixture();
  await prisma.markChatPilot.update({ where: { conversationId: f.chat.conversationId }, data: { expiresAt: new Date(0) } });
  await expect(readPrivateVisitor(f.token)).rejects.toThrow(/unavailable/);
  await expect(createPrivateChat(f.org.id, f.owner.id, { requestKey: randomUUID(), confirmFictional: false })).rejects.toThrow();
  vi.stubEnv("AI_MARK_PRIVATE_CHAT_ENABLED", "false");
  await expect(createPrivateChat(f.org.id, f.owner.id, { requestKey: randomUUID(), confirmFictional: true })).rejects.toThrow(/disabled/);
  expect(mocks.call).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
});
it("revalidates operator role and module entitlement at approval and rejects another conversation's draft", async () => {
  const f = await fixture(), other = await fixture(), message = await inbound(f); await generate(f, message.id);
  const draft = await prisma.replyDraft.findFirstOrThrow({ where: { conversationId: f.chat.conversationId } });
  const reply = { conversationId: f.chat.conversationId, draftId: draft.id, requestKey: randomUUID(), content: draft.content };
  await expect(sendPrivateChatReply(other.org.id, other.owner.id, { ...reply, conversationId: other.chat.conversationId })).rejects.toThrow(/stale/);
  await prisma.user.update({ where: { id: f.owner.id }, data: { role: "VIEWER" } });
  await expect(sendPrivateChatReply(f.org.id, f.owner.id, reply)).rejects.toThrow(/forbidden/);
  await prisma.user.update({ where: { id: f.owner.id }, data: { role: "OWNER" } });
  await prisma.organizationModule.updateMany({ where: { organizationId: f.org.id }, data: { status: "SUSPENDED" } });
  await expect(sendPrivateChatReply(f.org.id, f.owner.id, reply)).rejects.toThrow(/forbidden/);
  expect(await prisma.message.count({ where: { conversationId: f.chat.conversationId, role: "AGENT" } })).toBe(0);
});
it("recovery does not reopen a conversation that was already resolved", async () => {
  const f = await fixture(), message = await inbound(f);
  await controlPrivateChat(f.org.id, f.owner.id, f.chat.conversationId, "resolve");
  // Model a stale worker record left by an interrupted earlier application version.
  await prisma.replyDraft.create({ data: { organizationId: f.org.id, conversationId: f.chat.conversationId, basedOnMessageId: message.id, createdAt: new Date(Date.now() - 360000) } });
  expect(await recoverPrivateChat(f.org.id, f.owner.id, f.chat.conversationId)).toEqual({ recovered: 1 });
  expect(await prisma.conversation.findUnique({ where: { id: f.chat.conversationId } })).toMatchObject({ status: "RESOLVED", aiHandled: false });
  expect(mocks.call).not.toHaveBeenCalled();
});

it("history remains permission checked when private chat is disabled", async () => {
  const f = await fixture(), client = await createTestUser(f.org.id, "CLIENT", "chat-client");
  vi.stubEnv("AI_MARK_PRIVATE_CHAT_ENABLED", "false");
  await expect(assertPrivateChatViewer(f.org.id, client.id)).rejects.toThrow(/forbidden/);
  await expect(assertPrivateChatViewer(f.org.id, f.owner.id)).resolves.toBeUndefined();
  expect(mocks.call).not.toHaveBeenCalled();
});

const setMode = (f: Awaited<ReturnType<typeof fixture>>, mode: "OFF" | "SUGGEST" | "AUTO", version = 0) => configurePrivateChatMode(f.org.id, f.owner.id, { mode, version, confirmCost: true, confirmFictional: true });
it("autonomous mode enqueues durably and answers once without any operator approval", async () => {
  const f = await fixture(); await setMode(f, "AUTO");
  const input = { requestKey: randomUUID(), content: "¿Cuál es el horario ficticio?" };
  const message = await postPrivateVisitor(f.token, input); expect(message.jobId).toBeTruthy(); expect(mocks.call).not.toHaveBeenCalled();
  expect(await postPrivateVisitor(f.token, input)).toEqual(message);
  expect(await prisma.webhookEvent.count({ where: { organizationId: f.org.id, eventType: "ai.mark_private_chat" } })).toBe(1);
  await Promise.all([processPrivateChatJob(message.jobId!), processPrivateChatJob(message.jobId!)]);
  expect(mocks.call).toHaveBeenCalledTimes(1); expect(mocks.send).not.toHaveBeenCalled();
  expect((await readPrivateVisitor(f.token)).messages.map(m => m.role)).toEqual(["USER", "ASSISTANT"]);
  expect(await prisma.conversation.findUnique({ where: { id: f.chat.conversationId } })).toMatchObject({ aiHandled: true });
  await processPrivateChatJob(message.jobId!); expect(mocks.call).toHaveBeenCalledTimes(1);
});
it("OFF blocks AI but preserves manual replies; suggest creates no autonomous job", async () => {
  const f = await fixture(); expect((await inbound(f)).jobId).toBeUndefined();
  await setMode(f, "OFF"); const msg = await inbound(f); expect(msg.jobId).toBeUndefined();
  await expect(generate(f, msg.id)).rejects.toThrow(/mode_disabled/);
  await sendPrivateChatReply(f.org.id, f.owner.id, { conversationId: f.chat.conversationId, content: "Respuesta manual", requestKey: randomUUID() });
  expect((await readPrivateVisitor(f.token)).messages.at(-1)?.content).toBe("Respuesta manual"); expect(mocks.call).not.toHaveBeenCalled();
});
it("mode changes require a fresh manager, version and explicit autonomous cost consent", async () => {
  const f = await fixture(), staff = await createTestUser(f.org.id, "AGENT", "mode-staff"), other = await fixture();
  await expect(configurePrivateChatMode(f.org.id, staff.id, { mode: "OFF", version: 0 })).rejects.toThrow(/forbidden/);
  await expect(configurePrivateChatMode(f.org.id, other.owner.id, { mode: "OFF", version: 0 })).rejects.toThrow(/forbidden/);
  await expect(configurePrivateChatMode(f.org.id, f.owner.id, { mode: "AUTO", version: 0 })).rejects.toThrow();
  await setMode(f, "AUTO"); await expect(setMode(f, "OFF")).rejects.toThrow(/mode_changed/);
  expect(mocks.call).not.toHaveBeenCalled();
});
it("turning OFF or taking human control during generation discards the late reply and keeps cost", async () => {
  for (const action of ["off", "take"] as const) {
    const f = await fixture(); await setMode(f, "AUTO"); const msg = await inbound(f);
    mocks.call.mockImplementationOnce(async () => { if (action === "off") await setMode(f, "OFF", 1); else await controlPrivateChat(f.org.id, f.owner.id, f.chat.conversationId, "take"); return response(); });
    await processPrivateChatJob(msg.jobId!); expect((await readPrivateVisitor(f.token)).messages).toHaveLength(1);
    expect((await prisma.aiUsage.findFirstOrThrow({ where: { organizationId: f.org.id } })).status).toBe("SUCCEEDED");
  }
});
it("human requests, missing sources and unsafe replies never get an automatic reply", async () => {
  const f = await fixture(); await setMode(f, "AUTO");
  expect((await inbound(f, "Quiero hablar con una persona")).jobId).toBeUndefined(); expect(mocks.call).not.toHaveBeenCalled();
  await controlPrivateChat(f.org.id, f.owner.id, f.chat.conversationId, "release");
  const unmatched = await inbound(f, "zqxvnotmatching"); await processPrivateChatJob(unmatched.jobId!); expect(mocks.call).not.toHaveBeenCalled();
  await controlPrivateChat(f.org.id, f.owner.id, f.chat.conversationId, "release");
  const unsafe = await inbound(f); mocks.call.mockResolvedValueOnce({ ...response(), text: "Paga en https://example.test" }); await processPrivateChatJob(unsafe.jobId!);
  expect((await readPrivateVisitor(f.token)).messages.filter(m => m.role === "ASSISTANT")).toHaveLength(0);
  expect((await readPrivateVisitor(f.token)).human).toBe(true);
});
it("a human can explicitly request a recommendation while retaining control; it never auto-sends", async () => {
  const f = await fixture(); await setMode(f, "AUTO"); await controlPrivateChat(f.org.id, f.owner.id, f.chat.conversationId, "take"); const msg = await inbound(f);
  expect(msg.jobId).toBeUndefined();
  await generatePrivateChatDraft(f.org.id, f.owner.id, f.chat.conversationId, msg.id, true, { humanRequested: true });
  const view = await readPrivateChatOperator(f.org.id, f.owner.id, f.chat.conversationId);
  expect(view.turn).toMatchObject({ status: "READY", humanRequested: true }); expect(view.aiHandled).toBe(false);
  expect((await readPrivateVisitor(f.token)).messages).toHaveLength(1);
  await sendPrivateChatReply(f.org.id, f.owner.id, { conversationId: f.chat.conversationId, draftId: view.turn!.draftId, requestKey: randomUUID(), content: "Texto revisado por una persona" });
  expect((await readPrivateVisitor(f.token)).messages.at(-1)?.role).toBe("AGENT");
});
it("recovery runs a pending job but escalates an abandoned claim without a second provider call", async () => {
  const f = await fixture(); await setMode(f, "AUTO"); const msg = await inbound(f);
  await recoverPrivateChatJobs(); expect(mocks.call).toHaveBeenCalledTimes(1);
  const next = await inbound(f); await prisma.webhookEvent.update({ where: { id: next.jobId }, data: { status: "PROCESSING", claimedAt: new Date(Date.now() - 360000), attempts: 1 } });
  await recoverPrivateChatJobs(); expect(mocks.call).toHaveBeenCalledTimes(1); expect((await readPrivateVisitor(f.token)).human).toBe(true);
  await processPrivateChatJob(msg.jobId!); expect(mocks.call).toHaveBeenCalledTimes(1);
});
it("revoked actor permissions and exhausted budget stop automatic work without a provider call", async () => {
  const f = await fixture(); await setMode(f, "AUTO"); const msg = await inbound(f);
  await prisma.user.update({ where: { id: f.owner.id }, data: { role: "VIEWER" } }); await processPrivateChatJob(msg.jobId!); expect(mocks.call).not.toHaveBeenCalled();
  await prisma.user.update({ where: { id: f.owner.id }, data: { role: "OWNER" } }); await controlPrivateChat(f.org.id, f.owner.id, f.chat.conversationId, "release");
  await prisma.aiBudgetSetting.update({ where: { organizationId: f.org.id }, data: { monthlyBudgetMxn: 0 } });
  const next = await inbound(f); await processPrivateChatJob(next.jobId!); expect(mocks.call).not.toHaveBeenCalled(); expect((await readPrivateVisitor(f.token)).human).toBe(true);
});

it("an uncertain automatic call retains its hold and never retries during recovery", async () => {
  const f = await fixture(); await setMode(f, "AUTO"); const msg = await inbound(f);
  mocks.call.mockRejectedValueOnce(new Error("synthetic timeout")); await processPrivateChatJob(msg.jobId!);
  const root = await prisma.aiPilotBudgetRoot.findFirstOrThrow({ where: { organizationId: f.org.id } });
  expect(root.state).toBe("UNCERTAIN"); expect(Number(root.holdMxn)).toBe(1);
  await recoverPrivateChatJobs(); await processPrivateChatJob(msg.jobId!); expect(mocks.call).toHaveBeenCalledTimes(1);
  expect((await readPrivateVisitor(f.token)).messages).toHaveLength(1);
});
