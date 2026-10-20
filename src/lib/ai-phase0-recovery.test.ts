// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { cleanupOrg, createTestOrg, createTestUser, fakeSession } from "@/test/helpers";
import { AUTO_JOB_LEASE_MS, AUTO_JOB_SOURCE, AUTO_JOB_TYPE, enqueueAutoReply } from "./ai-auto-jobs";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue({ sent: true }) }));
const generate = vi.fn(), trigger = vi.fn(), auth = vi.fn(), notify = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/admin-notifications", () => ({ notifyAdmins: (...args: unknown[]) => notify(...args) }));
vi.mock("@/lib/ai-draft", async (original) => ({ ...await original<typeof import("./ai-draft")>(), generateText: (...args: unknown[]) => generate(...args), isDraftProviderConfigured: () => true }));
vi.mock("@/lib/n8n", () => ({ triggerN8nWorkflow: (...args: unknown[]) => trigger(...args) }));
vi.mock("@/lib/auth", () => ({ auth: () => auth(), isAdmin: (r: string) => ["ADMIN", "SUPER_ADMIN"].includes(r) }));
const { processAutoReplyJob, recoverAutoReplies, runAutoReply } = await import("./ai-auto-reply");
const { processConversationEvent } = await import("./webhook-processors");
const { takeHumanControl, sendManualMessage } = await import("@/actions/conversations");
const { retryWebhookEvent } = await import("./webhook-retry");

const response = () => ({ text: JSON.stringify({ action: "reply", reply: "Abrimos de 9 a 6." }), model: "fixture", inputTokens: 1, outputTokens: 1 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe("Phase0 durable AUTO admission, recovery and takeover", () => {
  const orgs: string[] = [];
  const setup = async () => {
    const org = await createTestOrg("Phase0 Recovery"); orgs.push(org.id);
    const owner = await createTestUser(org.id, "OWNER", "phase0-recovery");
    auth.mockResolvedValue(fakeSession(owner));
    await prisma.agentChannelSetting.create({ data: { organizationId: org.id, channel: "whatsapp", mode: "AUTO" } });
    const { conversationId } = await processConversationEvent({ channel: "whatsapp", contactPhone: "8112345678", message: { role: "USER", content: "Horario?", externalId: "in-1" } }, org.id);
    const message = await prisma.message.findFirstOrThrow({ where: { conversationId, role: "USER" } });
    const job = await prisma.webhookEvent.findFirstOrThrow({ where: { organizationId: org.id, source: AUTO_JOB_SOURCE, eventType: AUTO_JOB_TYPE } });
    return { org, owner, conversationId, message, job };
  };
  beforeEach(() => { notify.mockClear(); generate.mockReset().mockResolvedValue(response()); trigger.mockReset().mockResolvedValue({ success: true }); });
  afterEach(async () => { vi.restoreAllMocks(); for (const id of orgs.splice(0)) await cleanupOrg(id); });

  it("persists work before after() and recovers it once, even with competing workers", async () => {
    const { org, conversationId, job } = await setup();
    expect(job).toMatchObject({ status: "PENDING", attempts: 0 });
    await Promise.all([recoverAutoReplies({ organizationId: org.id }), processAutoReplyJob(job.id), runAutoReply(org.id, conversationId)]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(await prisma.message.count({ where: { conversationId, role: "ASSISTANT" } })).toBe(1);
    expect(await prisma.webhookEvent.findUnique({ where: { id: job.id } })).toMatchObject({ status: "PROCESSED" });
    await recoverAutoReplies({ organizationId: org.id });
    expect(trigger).toHaveBeenCalledTimes(1);
  });
  it.each(["takeover", "manual_reply", "off", "suspend", "new_turn"])("revalidates %s after inference and suppresses stale outbound", async (change) => {
    const { org, conversationId, job } = await setup();
    const started = deferred<void>(), answer = deferred<ReturnType<typeof response>>();
    generate.mockImplementation(() => { started.resolve(); return answer.promise; });
    const running = processAutoReplyJob(job.id);
    await started.promise;
    if (change === "takeover") await takeHumanControl(conversationId);
    if (change === "manual_reply") await sendManualMessage({ conversationId, content: "Yo te atiendo" });
    if (change === "off") await prisma.agentChannelSetting.update({ where: { organizationId_channel: { organizationId: org.id, channel: "whatsapp" } }, data: { mode: "OFF" } });
    if (change === "suspend") await prisma.organization.update({ where: { id: org.id }, data: { isActive: false } });
    if (change === "new_turn") await processConversationEvent({ conversationId, channel: "whatsapp", message: { role: "USER", content: "Otra pregunta", externalId: "in-2" } }, org.id);
    answer.resolve(response());
    expect(await running).toBe("skipped");
    expect(trigger).toHaveBeenCalledTimes(change === "manual_reply" ? 1 : 0);
    expect(await prisma.replyDraft.findFirst({ where: { conversationId } })).toMatchObject({ status: "DISMISSED" });
  });
  it("provider failure is terminal, keeps the draft and hands off instead of blindly retrying", async () => {
    const { org, conversationId, job } = await setup();
    generate.mockRejectedValue(new Error("private-provider-details"));
    expect(await processAutoReplyJob(job.id)).toBe("escalated");
    expect(await prisma.replyDraft.findFirst({ where: { conversationId } })).toMatchObject({ status: "FAILED" });
    expect(await prisma.conversation.findUnique({ where: { id: conversationId } })).toMatchObject({ status: "ESCALATED", aiHandled: false, escalatedAt: expect.any(Date) });
    await recoverAutoReplies({ organizationId: org.id, now: new Date(Date.now() + AUTO_JOB_LEASE_MS + 1) });
    expect(generate).toHaveBeenCalledTimes(1); expect(trigger).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await prisma.webhookEvent.findUnique({ where: { id: job.id } }))).not.toContain("private-provider-details");
  });
  it("n8n failure/ambiguous acceptance is visible and never resent", async () => {
    const { org, conversationId, job } = await setup();
    trigger.mockResolvedValue({ success: false, error: "timeout" });
    expect(await processAutoReplyJob(job.id)).toBe("escalated");
    expect(await prisma.message.findFirst({ where: { conversationId, role: "ASSISTANT" } })).toMatchObject({ deliveryStatus: "FAILED" });
    await recoverAutoReplies({ organizationId: org.id, now: new Date(Date.now() + AUTO_JOB_LEASE_MS + 1) });
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it.each(["generating", "dispatching"] as const)("recovers a process killed at %s without repeating the uncertain side effect", async (stage) => {
    const { org, conversationId, message, job } = await setup();
    const draft = await prisma.replyDraft.create({ data: { organizationId: org.id, conversationId, basedOnMessageId: message.id, status: stage === "generating" ? "GENERATING" : "USED" } });
    const outbound = stage === "dispatching" ? await prisma.message.create({ data: { conversationId, role: "ASSISTANT", content: "Pending", deliveryStatus: "PENDING" } }) : null;
    await prisma.webhookEvent.update({ where: { id: job.id }, data: { status: "PROCESSING", attempts: 1, claimedAt: new Date(Date.now() - AUTO_JOB_LEASE_MS - 1), payload: { conversationId, messageId: message.id, stage, draftId: draft.id, ...(outbound ? { outboundMessageId: outbound.id } : {}) } } });
    await recoverAutoReplies({ organizationId: org.id });
    expect(generate).not.toHaveBeenCalled(); expect(trigger).not.toHaveBeenCalled();
    expect(await prisma.conversation.findUnique({ where: { id: conversationId } })).toMatchObject({ status: "ESCALATED", aiHandled: false });
    expect(await prisma.replyDraft.count({ where: { conversationId, status: "GENERATING" } })).toBe(0);
  });
  it("recovers the final expired lease instead of leaving the third attempt stuck", async () => {
    const { org, conversationId, job } = await setup();
    await prisma.webhookEvent.update({ where: { id: job.id }, data: { status: "PROCESSING", attempts: 3, claimedAt: new Date(Date.now() - AUTO_JOB_LEASE_MS - 1) } });
    await recoverAutoReplies({ organizationId: org.id });
    expect(await prisma.webhookEvent.findUnique({ where: { id: job.id } })).toMatchObject({ status: "PROCESSED", attempts: 3 });
    expect(await prisma.conversation.findUnique({ where: { id: conversationId } })).toMatchObject({ status: "ESCALATED" });
    expect(generate).not.toHaveBeenCalled();
  });
  it("does not use the generic webhook retry path for internal jobs", async () => {
    const { job } = await setup();
    await expect(retryWebhookEvent(job.id)).rejects.toThrow(/cron/);
    expect(generate).not.toHaveBeenCalled();
  });
  it("duplicate inbound events admit one internal job", async () => {
    const { org, conversationId, message } = await setup();
    await Promise.all(Array.from({ length: 4 }, () => prisma.$transaction((tx) => enqueueAutoReply(tx, org.id, conversationId, message.id))));
    expect(await prisma.webhookEvent.count({ where: { organizationId: org.id, source: AUTO_JOB_SOURCE, eventType: AUTO_JOB_TYPE } })).toBe(1);
  });
  it("serializes send admission with operator takeover across database connections", async () => {
    const { conversationId, job } = await setup();
    const sending = deferred<void>(), accepted = deferred<{ success: boolean }>();
    const order: string[] = [];
    trigger.mockImplementation(() => { order.push("send-admitted"); sending.resolve(); return accepted.promise; });
    const running = processAutoReplyJob(job.id);
    await sending.promise;
    let controlled = false;
    const takeover = takeHumanControl(conversationId).then(() => { controlled = true; order.push("human-controlled"); });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(controlled).toBe(false); // The admitted send holds the row until its bounded transport completes.
    order.push("transport-accepted"); accepted.resolve({ success: true });
    expect(await running).toBe("replied");
    await takeover;
    expect(order).toEqual(["send-admitted", "transport-accepted", "human-controlled"]);
    expect(await prisma.conversation.findUnique({ where: { id: conversationId } })).toMatchObject({ aiHandled: false });
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("internal recovery rejects a forged cross-tenant target without touching its outbound message", async () => {
    const a = await setup(), b = await setup();
    const outbound = await prisma.message.create({ data: { conversationId: b.conversationId, role: "ASSISTANT", content: "Private", deliveryStatus: "PENDING" } });
    await prisma.webhookEvent.update({ where: { id: a.job.id }, data: { payload: { conversationId: b.conversationId, messageId: b.message.id, stage: "dispatching", outboundMessageId: outbound.id } } });
    expect(await processAutoReplyJob(a.job.id)).toBe("skipped");
    expect(await prisma.message.findUnique({ where: { id: outbound.id } })).toMatchObject({ deliveryStatus: "PENDING" });
    expect(await prisma.conversation.findUnique({ where: { id: b.conversationId } })).toMatchObject({ status: "OPEN", aiHandled: true });
    expect(generate).not.toHaveBeenCalled(); expect(trigger).not.toHaveBeenCalled();
  });

  it("legacy orphan GENERATING becomes terminal without deleting it or calling the model again", async () => {
    const org = await createTestOrg("Phase0 Legacy Draft"); orgs.push(org.id);
    await prisma.agentChannelSetting.create({ data: { organizationId: org.id, channel: "whatsapp", mode: "AUTO" } });
    const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp" } });
    const message = await prisma.message.create({ data: { conversationId: conv.id, role: "USER", content: "Horario?" } });
    const draft = await prisma.replyDraft.create({ data: { organizationId: org.id, conversationId: conv.id, basedOnMessageId: message.id, status: "GENERATING", updatedAt: new Date(Date.now() - AUTO_JOB_LEASE_MS - 1) } });
    await recoverAutoReplies({ organizationId: org.id });
    expect(await prisma.replyDraft.findUnique({ where: { id: draft.id } })).toMatchObject({ status: "FAILED" });
    expect(await prisma.conversation.findUnique({ where: { id: conv.id } })).toMatchObject({ status: "ESCALATED", aiHandled: false });
    expect(generate).not.toHaveBeenCalled(); expect(trigger).not.toHaveBeenCalled();
  });

  it("atomic admission rolls back inbound message when persisting its recovery job fails", async () => {
    const { org } = await setup();
    const transaction = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, "$transaction").mockImplementationOnce((async (action: (tx: Prisma.TransactionClient) => Promise<unknown>) => transaction(async (tx) => action(new Proxy(tx, {
      get(target, prop) {
        if (prop === "webhookEvent") return { ...target.webhookEvent, upsert: async () => { throw new Error("Simulated job persistence failure"); } };
        return Reflect.get(target, prop);
      },
    })))) as never);
    await expect(processConversationEvent({ channel: "whatsapp", contactPhone: "8199999999", message: { role: "USER", content: "Do not accept without durable work", externalId: "atomic" } }, org.id)).rejects.toThrow("Simulated job persistence failure");
    expect(await prisma.conversation.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await prisma.message.count({ where: { conversation: { organizationId: org.id }, externalId: "atomic" } })).toBe(0);
    expect(await prisma.webhookEvent.count({ where: { organizationId: org.id, source: AUTO_JOB_SOURCE, eventType: AUTO_JOB_TYPE } })).toBe(1);
  });

  it("customer-requested human handoff uses the existing staff escalation alert", async () => {
    const { conversationId, job, message } = await setup();
    await prisma.message.update({ where: { id: message.id }, data: { content: "Quiero hablar con un humano" } });
    expect(await processAutoReplyJob(job.id)).toBe("escalated");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled(); expect(trigger).not.toHaveBeenCalled();
    expect(await prisma.conversation.findUnique({ where: { id: conversationId } })).toMatchObject({ status: "ESCALATED" });
  });

});
