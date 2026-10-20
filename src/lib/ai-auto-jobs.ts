import type { Prisma } from "@prisma/client";

// Internal work only. The signed channel webhooks and their payloads stay unchanged.
export const AUTO_JOB_SOURCE = "ai-center";
export const AUTO_JOB_TYPE = "ai.auto_reply";
export const AUTO_JOB_MAX_ATTEMPTS = 3;
export const AUTO_JOB_LEASE_MS = 10 * 60_000;

export type AutoJobPayload = {
  conversationId: string;
  messageId: string;
  stage: "queued" | "generating" | "dispatching";
  draftId?: string;
  outboundMessageId?: string;
};

/** Called in the SAME transaction as the inbound message, before acknowledging its webhook. */
export async function enqueueAutoReply(tx: Prisma.TransactionClient, organizationId: string, conversationId: string, messageId: string) {
  const conv = await tx.conversation.findFirst({ where: { id: conversationId, organizationId }, select: { channel: true, status: true, aiHandled: true, assignedToId: true } });
  if (!conv || conv.status !== "OPEN" || !conv.aiHandled || conv.assignedToId) return null;
  const mode = await tx.agentChannelSetting.findUnique({ where: { organizationId_channel: { organizationId, channel: conv.channel } }, select: { mode: true } });
  if (mode?.mode !== "AUTO") return null;
  const entitlement = await tx.organizationModule.findUnique({ where: { organizationId_module: { organizationId, module: "AI_WHATSAPP" } }, select: { status: true } });
  const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { isActive: true } });
  if (!org?.isActive || entitlement?.status !== "ACTIVE") return null;
  const payload: AutoJobPayload = { conversationId, messageId, stage: "queued" };
  return tx.webhookEvent.upsert({
    where: { organizationId_source_externalEventId: { organizationId, source: AUTO_JOB_SOURCE, externalEventId: `auto:${messageId}` } },
    create: { organizationId, source: AUTO_JOB_SOURCE, eventType: AUTO_JOB_TYPE, externalEventId: `auto:${messageId}`, payload, status: "PENDING" },
    update: {},
    select: { id: true },
  });
}

export const PIPELINE_JOB_TYPE = "ai.pipeline";

/** Preserve the existing SUGGEST/AUTO CRM analysis, but persist admission before after(). */
export async function enqueuePipelineAnalysis(tx: Prisma.TransactionClient, organizationId: string, conversationId: string, messageId: string) {
  const conv = await tx.conversation.findFirst({ where: { id: conversationId, organizationId }, select: { channel: true } });
  if (!conv) return;
  const [mode, modules, org] = await Promise.all([
    tx.agentChannelSetting.findUnique({ where: { organizationId_channel: { organizationId, channel: conv.channel } }, select: { mode: true } }),
    tx.organizationModule.count({ where: { organizationId, module: { in: ["CRM", "AI_WHATSAPP"] }, status: "ACTIVE" } }),
    tx.organization.findUnique({ where: { id: organizationId }, select: { isActive: true } }),
  ]);
  if ((mode?.mode ?? "SUGGEST") === "OFF" || modules !== 2 || !org?.isActive) return;
  await tx.webhookEvent.upsert({
    where: { organizationId_source_externalEventId: { organizationId, source: AUTO_JOB_SOURCE, externalEventId: `pipeline:${messageId}` } },
    create: { organizationId, source: AUTO_JOB_SOURCE, eventType: PIPELINE_JOB_TYPE, externalEventId: `pipeline:${messageId}`, payload: { conversationId, messageId, stage: "queued" }, status: "PENDING" },
    update: {},
  });
}
