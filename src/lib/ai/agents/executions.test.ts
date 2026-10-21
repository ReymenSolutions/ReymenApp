// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupAgentFixture } from "@/test/ai-agents-helpers";
import { createTestOrg } from "@/test/helpers";
import { AUTO_JOB_LEASE_MS, AUTO_JOB_SOURCE, AUTO_JOB_TYPE } from "@/lib/ai-job-contract";
import { backfillLegacyAgent, setAgentModelShadow } from "./model";
import { observeLegacyAdmission, reconcileAgentExecution, reconcileAgentExecutions } from "./executions";

vi.mock("next/server", async (original) => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));
const generate = vi.fn(), trigger = vi.fn();
vi.mock("@/lib/ai-draft", async (original) => ({ ...await original<typeof import("@/lib/ai-draft")>(), generateText: (...args: unknown[]) => generate(...args), isDraftProviderConfigured: () => true }));
vi.mock("@/lib/n8n", () => ({ triggerN8nWorkflow: (...args: unknown[]) => trigger(...args) }));
vi.mock("@/lib/admin-notifications", () => ({ notifyAdmins: vi.fn().mockResolvedValue(undefined) }));
const { processConversationEvent } = await import("@/lib/webhook-processors");
const { processAutoReplyJob, recoverAutoReplies } = await import("@/lib/ai-auto-reply");

describe("Phase 1 durable observation of the existing single worker", () => {
  const ids: string[] = [];
  const setup = async (shadow = true) => {
    const org = await createTestOrg("Phase1 execution"); ids.push(org.id);
    await prisma.whatsAppAssistant.create({ data: { organizationId: org.id, name: "Sofía", capabilities: [] } });
    await prisma.businessRulebook.create({ data: { organizationId: org.id, rules: "Horario de 9 a 6" } });
    await prisma.agentChannelSetting.create({ data: { organizationId: org.id, channel: "whatsapp", mode: "AUTO" } });
    if (shadow) {
      const dry = await backfillLegacyAgent(org.id);
      await setAgentModelShadow(org.id, true, dry.sourceHash, "fixture");
    }
    return org;
  };
  const inbound = async (id: string, externalId = "in-1") => {
    const { conversationId } = await processConversationEvent({ channel: "whatsapp", contactPhone: "8112345678", message: { role: "USER", content: "Horario?", externalId } }, id);
    const job = await prisma.webhookEvent.findFirstOrThrow({ where: { organizationId: id, source: AUTO_JOB_SOURCE, eventType: AUTO_JOB_TYPE, payload: { path: ["conversationId"], equals: conversationId } }, orderBy: { createdAt: "desc" } });
    return { conversationId, job };
  };
  beforeEach(() => {
    vi.stubEnv("AI_AGENT_MODEL_ENABLED", "true");
    generate.mockReset().mockResolvedValue({ text: JSON.stringify({ action: "reply", reply: "De 9 a 6." }), model: "fixture", inputTokens: 1, outputTokens: 1 });
    trigger.mockReset().mockResolvedValue({ success: true });
  });
  afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const id of ids.splice(0)) await cleanupAgentFixture(id); });

  it("global and tenant gates preserve original admissions without any model rows", async () => {
    const org = await setup(false); await inbound(org.id);
    expect(await prisma.agentExecution.count({ where: { organizationId: org.id } })).toBe(0);
    vi.stubEnv("AI_AGENT_MODEL_ENABLED", "false");
    const lookup = vi.spyOn(prisma.agentExecution, "findMany").mockRejectedValue(new Error("not migrated"));
    expect(await reconcileAgentExecutions()).toEqual({ reconciled: 0 });
    expect(lookup).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled(); expect(trigger).not.toHaveBeenCalled();
  });
  it("one event admits distinct reply/analysis roots atomically and pins an immutable revision", async () => {
    const org = await setup(); const { conversationId } = await inbound(org.id);
    const rows = await prisma.agentExecution.findMany({ where: { organizationId: org.id }, include: { steps: true } });
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.operation).sort()).toEqual(["ai.auto_reply", "ai.pipeline"]);
    expect(rows.every(r => r.status === "QUEUED" && r.configVersion === 1 && r.steps[0].stepKey === "admission")).toBe(true);
    const old = await prisma.agentConfigRevision.findFirstOrThrow({ where: { organizationId: org.id } });
    await prisma.whatsAppAssistant.update({ where: { organizationId: org.id }, data: { name: "Nombre posterior" } });
    await inbound(org.id, "in-2");
    const first = await prisma.agentExecution.findFirstOrThrow({ where: { id: rows[0].id } });
    expect(first.configVersion).toBe(1);
    expect(await prisma.agentConfigRevision.findFirst({ where: { organizationId: org.id, version: 1 } })).toEqual(old);
    expect(await prisma.agentExecution.count({ where: { organizationId: org.id, conversationId, configVersion: 2 } })).toBe(2);
    expect(generate).not.toHaveBeenCalled(); expect(trigger).not.toHaveBeenCalled();
  });
  it("competing existing workers send once; the new model records completion but never executes effects", async () => {
    const org = await setup(); const { job } = await inbound(org.id);
    await Promise.all([processAutoReplyJob(job.id), processAutoReplyJob(job.id), processAutoReplyJob(job.id)]);
    expect(generate).toHaveBeenCalledTimes(1); expect(trigger).toHaveBeenCalledTimes(1);
    const execution = await prisma.agentExecution.findFirstOrThrow({ where: { organizationId: org.id, legacyJobId: job.id }, include: { steps: true } });
    expect(execution).toMatchObject({ configVersion: 1, status: "SUCCEEDED", attempts: 1, leaseExpiresAt: null, completedAt: expect.any(Date) });
    expect(execution.steps.map(s => s.stepKey).sort()).toEqual(["admission", "dispatch", "generation"]);
    expect(execution.steps.every(s => s.status === "SUCCEEDED")).toBe(true);
    await reconcileAgentExecution(job.id);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(await prisma.aiUsage.count({ where: { organizationId: org.id } })).toBe(0); // Mocked generator; observation adds no ledger entries.
  });
  it("running generation is observable and human takeover cancels output without changing the pinned snapshot", async () => {
    const org = await setup(); const { conversationId, job } = await inbound(org.id);
    let started!: () => void;
    const entered = new Promise<void>(r => { started = r; });
    let resolve!: (value: { text: string; model: string; inputTokens: number; outputTokens: number }) => void;
    const answer = new Promise<{ text: string; model: string; inputTokens: number; outputTokens: number }>(r => { resolve = r; });
    generate.mockImplementation(() => { started(); return answer; });
    const running = processAutoReplyJob(job.id);
    await entered;
    expect(await prisma.agentExecution.findFirst({ where: { organizationId: org.id, legacyJobId: job.id } })).toMatchObject({ status: "RUNNING", configVersion: 1, attempts: 1 });
    await prisma.conversation.update({ where: { id: conversationId }, data: { aiHandled: false } });
    resolve({ text: JSON.stringify({ action: "reply", reply: "De 9 a 6." }), model: "fixture", inputTokens: 1, outputTokens: 1 });
    expect(await running).toBe("skipped");
    expect(await prisma.agentExecution.findFirst({ where: { organizationId: org.id, legacyJobId: job.id } })).toMatchObject({ status: "CANCELLED", configVersion: 1, lastErrorCode: "turn_no_longer_eligible" });
    expect(trigger).not.toHaveBeenCalled();
  });
  it("crashed generation recovers to human handoff without a second model or transport call", async () => {
    const org = await setup(); const { job } = await inbound(org.id);
    await prisma.webhookEvent.update({ where: { id: job.id }, data: { status: "PROCESSING", attempts: 1, claimedAt: new Date(Date.now() - AUTO_JOB_LEASE_MS - 1), payload: { ...(job.payload as object), stage: "generating" } } });
    await recoverAutoReplies({ organizationId: org.id });
    expect(await prisma.agentExecution.findFirst({ where: { organizationId: org.id, legacyJobId: job.id } })).toMatchObject({ status: "WAITING_HANDOFF", lastErrorCode: "legacy_handoff" });
    expect(generate).not.toHaveBeenCalled(); expect(trigger).not.toHaveBeenCalled();
  });
  it("cron repairs missed observer completion and does not replay provider/send", async () => {
    const org = await setup(); const { job } = await inbound(org.id);
    await prisma.webhookEvent.update({ where: { id: job.id }, data: { status: "PROCESSED", attempts: 1, processedAt: new Date() } });
    await reconcileAgentExecutions();
    expect(await prisma.agentExecution.findFirst({ where: { organizationId: org.id, legacyJobId: job.id } })).toMatchObject({ status: "SUCCEEDED", attempts: 1 });
    expect(generate).not.toHaveBeenCalled(); expect(trigger).not.toHaveBeenCalled();
  });
  it("retry timing/lease metadata follows Phase 0 and stale observers reread the authoritative job", async () => {
    const org = await setup(); const { job } = await inbound(org.id); const claimedAt = new Date();
    await prisma.webhookEvent.update({ where: { id: job.id }, data: { status: "FAILED", attempts: 1, claimedAt, errorMessage: "auto_work_interrupted" } });
    await reconcileAgentExecution(job.id);
    expect(await prisma.agentExecution.findFirst({ where: { organizationId: org.id, legacyJobId: job.id } })).toMatchObject({ status: "QUEUED", nextAttemptAt: new Date(claimedAt.getTime() + 60_000) });
    await prisma.webhookEvent.update({ where: { id: job.id }, data: { status: "PROCESSING", attempts: 2, claimedAt } });
    await Promise.all([reconcileAgentExecution(job.id), reconcileAgentExecution(job.id)]);
    expect(await prisma.agentExecution.findFirst({ where: { organizationId: org.id, legacyJobId: job.id } })).toMatchObject({ status: "RUNNING", attempts: 2, leaseExpiresAt: new Date(claimedAt.getTime() + AUTO_JOB_LEASE_MS), nextAttemptAt: null });
  });
  it("rejects cross-tenant admission and composite step/execution references", async () => {
    const a = await setup(), b = await setup(); const { job } = await inbound(a.id);
    await prisma.$transaction(tx => observeLegacyAdmission(tx, b.id, job.id));
    expect(await prisma.agentExecution.count({ where: { organizationId: b.id } })).toBe(0);
    const execution = await prisma.agentExecution.findFirstOrThrow({ where: { organizationId: a.id } });
    await expect(prisma.agentExecutionStep.create({ data: { organizationId: b.id, executionId: execution.id, stepKey: "forged", status: "SUCCEEDED" } })).rejects.toMatchObject({ code: "P2003" });
    await expect(prisma.agentExecution.create({ data: { organizationId: b.id, agentInstanceId: execution.agentInstanceId, configVersion: execution.configVersion, conversationId: execution.conversationId, messageId: execution.messageId, operation: "forged", legacyJobId: "forged" } })).rejects.toMatchObject({ code: "P2003" });
  });
  it("tenant rollback stops new observation while preserving pending roots and completion reconciliation", async () => {
    const org = await setup(); const { job } = await inbound(org.id);
    const dry = await backfillLegacyAgent(org.id);
    await setAgentModelShadow(org.id, false, dry.sourceHash, "fixture");
    const count = await prisma.agentExecution.count({ where: { organizationId: org.id } });
    await inbound(org.id, "in-2");
    expect(await prisma.agentExecution.count({ where: { organizationId: org.id } })).toBe(count);
    await prisma.webhookEvent.update({ where: { id: job.id }, data: { status: "PROCESSED", processedAt: new Date() } });
    await reconcileAgentExecution(job.id);
    expect(await prisma.agentExecution.findFirst({ where: { organizationId: org.id, legacyJobId: job.id } })).toMatchObject({ status: "SUCCEEDED" });
  });
  it("trace codes never expose model-generated escalation reasons even if they resemble a code", async () => {
    const org = await setup(); const { conversationId, job } = await inbound(org.id);
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "ESCALATED", aiHandled: false } });
    await prisma.webhookEvent.update({ where: { id: job.id }, data: { status: "PROCESSED", errorMessage: "customer_private_name", processedAt: new Date() } });
    await reconcileAgentExecution(job.id);
    const trace = await prisma.agentExecution.findFirstOrThrow({ where: { organizationId: org.id, legacyJobId: job.id }, include: { steps: true } });
    expect(trace.lastErrorCode).toBe("legacy_handoff");
    expect(JSON.stringify(trace)).not.toContain("customer_private_name");
  });
  it("admission failure rolls back the inbound message instead of accepting untracked shadow work", async () => {
    const org = await setup();
    const lock = await prisma.agentDefinition.findUniqueOrThrow({ where: { key_version: { key: "legacy-assistant", version: 1 } } });
    // Scoped mapping conflict only in this synthetic tenant, without changing the global definition.
    await prisma.agentInstance.updateMany({ where: { organizationId: org.id }, data: { legacyAssistantId: "ambiguous-old-id" } });
    await expect(inbound(org.id)).rejects.toThrow(/revisión/);
    expect(await prisma.message.count({ where: { conversation: { organizationId: org.id } } })).toBe(0);
    expect(await prisma.webhookEvent.count({ where: { organizationId: org.id } })).toBe(0);
    expect(lock.key).toBe("legacy-assistant");
  });
});
