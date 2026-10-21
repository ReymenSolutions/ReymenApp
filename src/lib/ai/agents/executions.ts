import type { AgentExecutionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTO_JOB_LEASE_MS, AUTO_JOB_SOURCE, AUTO_JOB_TYPE, PIPELINE_JOB_TYPE } from "@/lib/ai-job-contract";
import { agentModelEnabled, lockAgentModel, syncLegacyInstance } from "./model";

const LEGACY_ERROR_CODES = new Set([
  "turn_no_longer_eligible", "draft_already_exists", "invalid_auto_target", "invalid_auto_job",
  "delivery_unconfirmed", "auto_work_interrupted", "pipeline_execution_unconfirmed", "invalid_pipeline_job",
  "pipeline_turn_no_longer_eligible", "pipeline_contact_not_ready", "pipeline_skipped", "pipeline_work_interrupted",
]);

/** Observer only: Phase 0 WebhookEvent remains the sole lease/worker and external effects owner. */
export async function observeLegacyAdmission(tx: Prisma.TransactionClient, organizationId: string, jobId: string) {
  if (!agentModelEnabled()) return;
  const rollout = await tx.agentModelRollout.findUnique({ where: { organizationId } });
  if (!rollout?.shadowEnabled) return;
  const job = await tx.webhookEvent.findFirst({ where: { id: jobId, organizationId, source: AUTO_JOB_SOURCE, eventType: { in: [AUTO_JOB_TYPE, PIPELINE_JOB_TYPE] } } });
  const payload = job?.payload as { conversationId?: unknown; messageId?: unknown } | null;
  if (!job || !payload || typeof payload.conversationId !== "string" || typeof payload.messageId !== "string") return;
  const message = await tx.message.findFirst({ where: { id: payload.messageId, conversationId: payload.conversationId, role: "USER", conversation: { organizationId } }, select: { id: true } });
  if (!message) return;
  await lockAgentModel(tx, organizationId);
  if (!(await tx.agentModelRollout.findUnique({ where: { organizationId } }))?.shadowEnabled) return;
  const { instance } = await syncLegacyInstance(tx, organizationId);
  const execution = await tx.agentExecution.upsert({
    where: { organizationId_legacyJobId: { organizationId, legacyJobId: job.id } },
    create: { organizationId, agentInstanceId: instance.id, configVersion: instance.configVersion, conversationId: payload.conversationId, messageId: payload.messageId, operation: job.eventType, legacyJobId: job.id },
    update: {},
  });
  await tx.agentExecutionStep.upsert({ where: { organizationId_executionId_stepKey: { organizationId, executionId: execution.id, stepKey: "admission" } }, create: { organizationId, executionId: execution.id, stepKey: "admission", status: "SUCCEEDED" }, update: {} });
}

/** Always rereads the authoritative job under a lock: a late observer cannot regress a newer worker's state. */
export async function reconcileAgentExecution(jobId: string) {
  if (!agentModelEnabled()) return;
  await prisma.$transaction(async tx => {
    const existing = await tx.agentExecution.findFirst({ where: { legacyJobId: jobId }, select: { id: true, organizationId: true } });
    if (!existing) return;
    await tx.$queryRaw`SELECT id FROM "WebhookEvent" WHERE id = ${jobId} AND "organizationId" = ${existing.organizationId} FOR UPDATE`;
    const job = await tx.webhookEvent.findFirst({ where: { id: jobId, organizationId: existing.organizationId, source: AUTO_JOB_SOURCE, eventType: { in: [AUTO_JOB_TYPE, PIPELINE_JOB_TYPE] } } });
    if (!job) return;
    const payload = job.payload as { stage?: unknown; conversationId?: unknown; outboundMessageId?: unknown } | null;
    const conv = typeof payload?.conversationId === "string" ? await tx.conversation.findFirst({ where: { id: payload.conversationId, organizationId: job.organizationId }, select: { status: true } }) : null;
    const terminalFailure = job.status === "FAILED" && job.attempts >= 3;
    const errorCode = !job.errorMessage ? null : LEGACY_ERROR_CODES.has(job.errorMessage) ? job.errorMessage : "legacy_handoff";
    let status: AgentExecutionStatus = "QUEUED";
    if (job.status === "PROCESSING") status = "RUNNING";
    if (terminalFailure) status = "FAILED";
    if (job.status === "PROCESSED") status = conv?.status === "ESCALATED" ? "WAITING_HANDOFF" : errorCode ? "CANCELLED" : "SUCCEEDED";
    const retryDelay = job.eventType === PIPELINE_JOB_TYPE || job.attempts >= 2 ? 5 * 60_000 : 60_000;
    await tx.agentExecution.update({ where: { id: existing.id }, data: {
      status, attempts: job.attempts, claimedAt: job.claimedAt,
      leaseExpiresAt: job.status === "PROCESSING" && job.claimedAt ? new Date(job.claimedAt.getTime() + AUTO_JOB_LEASE_MS) : null,
      nextAttemptAt: job.status === "FAILED" && !terminalFailure && job.claimedAt ? new Date(job.claimedAt.getTime() + retryDelay) : null,
      lastErrorCode: errorCode, completedAt: job.processedAt,
    } });
    const stepKeys = job.eventType === PIPELINE_JOB_TYPE ? ["analysis"] : payload?.stage === "dispatching" ? ["generation", "dispatch"] : ["generation"];
    for (const stepKey of stepKeys) {
      const stepStatus = stepKey === "generation" && payload?.stage === "dispatching" ? "SUCCEEDED" : status === "WAITING_HANDOFF" ? "FAILED" : status;
      const data = { status: stepStatus as AgentExecutionStatus, attempts: job.attempts, lastErrorCode: errorCode };
      await tx.agentExecutionStep.upsert({ where: { organizationId_executionId_stepKey: { organizationId: job.organizationId, executionId: existing.id, stepKey } }, create: { organizationId: job.organizationId, executionId: existing.id, stepKey, ...data }, update: data });
    }
  });
}

/** Cron also reconciles after an observer process dies. Disabling tenant observation preserves/drains existing traces. */
export async function reconcileAgentExecutions(limit = 50) {
  if (!agentModelEnabled()) return { reconciled: 0 };
  const rows = await prisma.agentExecution.findMany({ where: { status: { in: ["QUEUED", "RUNNING"] } }, orderBy: { updatedAt: "asc" }, take: limit, select: { legacyJobId: true } });
  for (const row of rows) await reconcileAgentExecution(row.legacyJobId);
  return { reconciled: rows.length };
}

/** Diagnostic observation failures must not turn an accepted/sent legacy reply into a retry. */
export async function observeLegacyCompletion(jobId: string) {
  try { await reconcileAgentExecution(jobId); }
  catch { console.error("[agent-model] observation pending", { jobId }); }
}
