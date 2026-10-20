import { after } from "next/server";
import { observeLegacyCompletion } from "./ai/agents/executions";
import { Prisma, type MessageRole, type WebhookEvent } from "@prisma/client";
import { z } from "zod";
import { AUTO_JOB_SOURCE, AUTO_JOB_TYPE, AUTO_JOB_MAX_ATTEMPTS, AUTO_JOB_LEASE_MS, enqueueAutoReply, type AutoJobPayload } from "./ai-auto-jobs";
import { prisma } from "@/lib/prisma";
import { triggerN8nWorkflow } from "@/lib/n8n";
import { recordMetric, METRIC_KEYS } from "@/lib/metrics";
import { notifyAdmins } from "./admin-notifications";
import { escalationAlertEmail } from "./email-templates";
import { appUrl } from "./app-url";
import { outboundWorkflowPath, messagePreview } from "@/lib/channels";
import { buildBusinessInstructions } from "@/lib/rulebook";
import { buildDraftMessages, generateText, isDraftProviderConfigured } from "@/lib/ai-draft";
import { AiBudgetError } from "@/lib/ai/budget";

// ── Reglas de seguridad del modo Automático ──────────────────────────────────
// El agente solo contesta lo rutinario dentro del rulebook; ante cualquier duda, o si el cliente pide a una persona,
// la conversación pasa a una persona con el motivo a la vista.

/** Máximo de respuestas automáticas por conversación en una hora (corta ciclos bot↔bot). */
export const AUTO_REPLIES_PER_HOUR = 3;
/** Si una persona respondió hace menos de esto, el agente no se mete. */
const HUMAN_ACTIVE_MS = 24 * 60 * 60 * 1000;
const MAX_REPLY_CHARS = 1000;

const HUMAN_REQUEST = /\b(humano|persona real|una persona|asesor|agente humano|gerente|encargado|supervisor|queja|reclam\w*|reembols\w*|devoluci\w*|cancel\w*|demanda|abogado|profeco|estafa|fraude|human|real person|manager|complain\w*|refund|lawyer|sue you|scam|fraud)\b/i;
const URL_RE = /https?:\/\/|www\./i;
const PAYMENT_RE = /\b(dep[oó]sito|transferencia|clabe|tarjeta|paypal|anticipo|pago anticipado|deposit|wire|credit card|bank account|payment link)\b/i;

/** ¿El cliente pide a una persona o trae un tema delicado? Entonces no contesta el agente. */
export function customerNeedsHuman(text: string): boolean {
  return HUMAN_REQUEST.test(text);
}

/** Motivo por el que una respuesta redactada no debe salir sola (o null si pasa). */
export function unsafeReason(reply: string): string | null {
  const text = reply.trim();
  if (!text) return "empty_reply";
  if (text.length > MAX_REPLY_CHARS) return "too_long";
  if (URL_RE.test(text)) return "contains_link";
  if (PAYMENT_RE.test(text)) return "mentions_payment";
  return null;
}

export type AutoDecision = { action: "reply"; reply: string } | { action: "escalate"; reason: string };

/** Lee la decisión del modelo (JSON). Cualquier cosa rara se trata como "pasar a una persona". */
export function parseDecision(raw: string): AutoDecision {
  const body = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(body) as { action?: unknown; reply?: unknown; reason?: unknown };
    if (parsed.action === "reply" && typeof parsed.reply === "string") return { action: "reply", reply: parsed.reply.trim() };
    if (parsed.action === "escalate") return { action: "escalate", reason: typeof parsed.reason === "string" && parsed.reason.trim() ? parsed.reason.trim().slice(0, 200) : "model_escalated" };
  } catch {
    /* cae al caso por defecto */
  }
  return { action: "escalate", reason: "unreadable_decision" };
}

const AUTO_PREAMBLE = `You are the AI agent answering customers of a small business, on its behalf, with no human reviewing the reply before it is sent.

Decide: either reply, or hand the conversation to a person.
- Reply ONLY if the BUSINESS RULEBOOK and knowledge below fully cover the question. Match the customer's language (Spanish or English). Be short and clear; plain text, no markdown, no placeholders.
- Never invent prices, dates, availability or promises. Never send links, payment details or ask for payment.
- Hand over ("escalate") when: the answer is not in the rulebook, the customer is upset, wants a refund/cancellation, asks for a person, makes a legal or safety claim, or the request is ambiguous.

Answer with ONLY this JSON, nothing else:
{"action":"reply","reply":"<text for the customer>"} or {"action":"escalate","reason":"<one short sentence for the staff, in Spanish>"}`;

export type AutoOutcome = "replied" | "escalated" | "skipped";

const payloadSchema = z.object({
  conversationId: z.string().min(1), messageId: z.string().min(1),
  stage: z.enum(["queued", "generating", "dispatching"]),
  draftId: z.string().optional(), outboundMessageId: z.string().optional(),
});
const leaseWhere = (job: WebhookEvent) => ({ id: job.id, status: "PROCESSING" as const, attempts: job.attempts, claimedAt: job.claimedAt });
class LeaseLost extends Error {}

async function lockTurn(tx: Prisma.TransactionClient, organizationId: string, conversationId: string) {
  await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} AND "organizationId" = ${organizationId} FOR UPDATE`;
}

/** This read happens under the conversation row lock, including immediately before dispatch. */
async function eligibleTurn(tx: Prisma.TransactionClient, organizationId: string, payload: AutoJobPayload, latestId: string, now: Date) {
  const conv = await tx.conversation.findFirst({ where: { id: payload.conversationId, organizationId }, include: { organization: { select: { isActive: true } }, lead: { select: { status: true } } } });
  if (!conv || !conv.organization.isActive || conv.status !== "OPEN" || !conv.aiHandled || conv.assignedToId) return null;
  const [entitlement, mode, recent] = await Promise.all([
    tx.organizationModule.findUnique({ where: { organizationId_module: { organizationId, module: "AI_WHATSAPP" } }, select: { status: true } }),
    tx.agentChannelSetting.findUnique({ where: { organizationId_channel: { organizationId, channel: conv.channel } }, select: { mode: true } }),
    tx.message.findMany({ where: { conversationId: conv.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 30 }),
  ]);
  if (entitlement?.status !== "ACTIVE" || mode?.mode !== "AUTO" || recent[0]?.id !== latestId) return null;
  const basedOn = await tx.message.findFirst({ where: { id: payload.messageId, conversationId: conv.id, role: "USER" } });
  if (!basedOn || recent.some((m) => m.role === "AGENT" && now.getTime() - m.createdAt.getTime() < HUMAN_ACTIVE_MS)) return null;
  return { conv, messages: recent.reverse() };
}

async function assertLease(tx: Prisma.TransactionClient, job: WebhookEvent) {
  if (!(await tx.webhookEvent.findFirst({ where: leaseWhere(job), select: { id: true } }))) throw new LeaseLost();
}

async function finishJob(tx: Prisma.TransactionClient, job: WebhookEvent, reason: string | null = null) {
  const done = await tx.webhookEvent.updateMany({ where: leaseWhere(job), data: { status: "PROCESSED", processedAt: new Date(), errorMessage: reason } });
  if (!done.count) throw new LeaseLost();
}

/** No resend after an uncertain provider/send attempt. Keep the record and hand it to a person. */
async function alertEscalation(organizationId: string, conversationId: string) {
  try {
    const conv = await prisma.conversation.findFirst({ where: { id: conversationId, organizationId }, include: { organization: { select: { name: true } } } });
    if (!conv) return;
    await notifyAdmins(escalationAlertEmail(conv.organization.name, conv.contactName ?? conv.contactPhone ?? "Un contacto", appUrl("/admin/escalations")));
  } catch { console.error("[ai-auto-reply] escalation alert unavailable", { conversationId }); }
}

async function stopJob(job: WebhookEvent, payload: AutoJobPayload, reason: string, now: Date, failed = false): Promise<AutoOutcome> {
  const outcome: AutoOutcome = await prisma.$transaction(async (tx) => {
    await lockTurn(tx, job.organizationId, payload.conversationId);
    await assertLease(tx, job);
    const target = await tx.conversation.findFirst({ where: { id: payload.conversationId, organizationId: job.organizationId }, select: { id: true } });
    if (!target) { await finishJob(tx, job, "invalid_auto_target"); return "skipped"; }
    if (payload.outboundMessageId) {
      const delivery = await tx.message.findFirst({ where: { id: payload.outboundMessageId, conversationId: target.id }, select: { deliveryStatus: true } });
      if (delivery && ["SENT", "DELIVERED", "READ"].includes(delivery.deliveryStatus ?? "")) {
        await finishJob(tx, job);
        return "replied";
      }
    }
    if (payload.draftId) await tx.replyDraft.updateMany({ where: { id: payload.draftId, organizationId: job.organizationId, conversationId: payload.conversationId, status: { in: ["GENERATING", "READY"] } }, data: { status: failed ? "FAILED" : "DISMISSED", error: reason } });
    if (payload.outboundMessageId) await tx.message.updateMany({ where: { id: payload.outboundMessageId, conversationId: payload.conversationId, deliveryStatus: "PENDING" }, data: { deliveryStatus: "FAILED" } });
    const eligible = await eligibleTurn(tx, job.organizationId, payload, payload.outboundMessageId ?? payload.messageId, now);
    if (eligible) {
      await tx.conversation.update({ where: { id: payload.conversationId }, data: { status: "ESCALATED", aiHandled: false, escalatedAt: now } });
      await tx.message.create({ data: { conversationId: payload.conversationId, role: "SYSTEM", content: `El Agente IA pasó esta conversación a una persona: ${reason}` } });
      await tx.auditLog.create({ data: { organizationId: job.organizationId, action: "ai_auto.escalate", resource: "Conversation", resourceId: payload.conversationId, metadata: { reason, jobId: job.id } } });
    }
    await finishJob(tx, job, reason);
    return eligible ? "escalated" : "skipped";
  });
  if (outcome === "escalated") await alertEscalation(job.organizationId, payload.conversationId);
  return outcome;
}

/** Atomically claims one persisted turn; old workers cannot finalize a newer lease. */
async function processAutoReplyJobInternal(jobId: string, opts: { now?: Date } = {}): Promise<AutoOutcome> {
  const now = opts.now ?? new Date();
  const stored = await prisma.webhookEvent.findFirst({ where: { id: jobId, source: AUTO_JOB_SOURCE, eventType: AUTO_JOB_TYPE } });
  if (!stored || stored.status === "PROCESSED") return "skipped";
  if (stored.status === "PROCESSING" && stored.claimedAt && now.getTime() - stored.claimedAt.getTime() < AUTO_JOB_LEASE_MS) return "skipped";
  if (stored.status === "FAILED" && stored.claimedAt && now.getTime() - stored.claimedAt.getTime() < (stored.attempts >= 2 ? 5 : 1) * 60_000) return "skipped";
  const claimed = await prisma.webhookEvent.updateMany({ where: { id: stored.id, status: stored.status, attempts: stored.attempts, claimedAt: stored.claimedAt }, data: { status: "PROCESSING", attempts: Math.min(stored.attempts + 1, AUTO_JOB_MAX_ATTEMPTS), claimedAt: now } });
  if (!claimed.count) return "skipped";
  await observeLegacyCompletion(jobId);
  const job = { ...stored, status: "PROCESSING" as const, attempts: Math.min(stored.attempts + 1, AUTO_JOB_MAX_ATTEMPTS), claimedAt: now };
  const parsed = payloadSchema.safeParse(stored.payload);
  if (!parsed.success) {
    await prisma.webhookEvent.updateMany({ where: leaseWhere(job), data: { status: "PROCESSED", processedAt: new Date(), errorMessage: "invalid_auto_job" } });
    return "skipped";
  }
  let payload = parsed.data;
  try {
    // A process may have died after the vendor accepted a call or send. Never repeat that side effect.
    if (stored.attempts >= AUTO_JOB_MAX_ATTEMPTS) return await stopJob(job, payload, "La operación de IA agotó sus intentos; requiere atención del equipo.", now, true);
    if (payload.stage !== "queued") return await stopJob(job, payload, payload.stage === "dispatching" ? "No se pudo confirmar el envío; revisa la conversación antes de responder." : "La generación anterior se interrumpió; requiere atención del equipo.", now, true);
    if (!isDraftProviderConfigured()) return await stopJob(job, payload, "El proveedor de IA no está disponible.", now, true);
    const preparation = await prisma.$transaction(async (tx) => {
      await lockTurn(tx, job.organizationId, payload.conversationId);
      await assertLease(tx, job);
      const eligible = await eligibleTurn(tx, job.organizationId, payload, payload.messageId, now);
      if (!eligible) { await finishJob(tx, job, "turn_no_longer_eligible"); return null; }
      const existing = await tx.replyDraft.findUnique({ where: { conversationId_basedOnMessageId: { conversationId: payload.conversationId, basedOnMessageId: payload.messageId } } });
      // A human draft or prior automatic attempt owns this message. Never replace or send it again.
      if (existing) { await finishJob(tx, job, "draft_already_exists"); return null; }
      const draft = await tx.replyDraft.create({ data: { organizationId: job.organizationId, conversationId: payload.conversationId, basedOnMessageId: payload.messageId, status: "GENERATING" } });
      const next: AutoJobPayload = { ...payload, stage: "generating", draftId: draft.id };
      await tx.webhookEvent.updateMany({ where: leaseWhere(job), data: { payload: next } });
      return { ...eligible, draft, next };
    });
    if (!preparation) return "skipped";
    payload = preparation.next;
    await observeLegacyCompletion(jobId);
    const { conv, messages, draft } = preparation;
    const last = messages[messages.length - 1];
    if (customerNeedsHuman(last.content)) return await stopJob(job, payload, "el cliente pidió a una persona o trae un tema delicado", now);
    const sent = await prisma.message.count({ where: { conversationId: conv.id, role: "ASSISTANT", createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } } });
    if (sent >= AUTO_REPLIES_PER_HOUR) return await stopJob(job, payload, "demasiadas respuestas automáticas seguidas en esta conversación", now);
    const instructions = await buildBusinessInstructions(job.organizationId);
    const customer = [`Channel: ${conv.channel}`, ...(conv.contactName ? [`Name: ${conv.contactName}`] : []), ...(conv.lead?.status ? [`CRM status: ${conv.lead.status}`] : [])];
    const system = [AUTO_PREAMBLE, `BUSINESS RULEBOOK\n${instructions.trim() || "(empty: the business has not written a rulebook, so escalate everything)"}`, `CUSTOMER CONTEXT\n${customer.join("\n")}`].join("\n\n");
    let result;
    try {
      result = await generateText({ organizationId: job.organizationId, agentKey: `inbox:${conv.channel}`, operation: "auto_reply", origin: conv.channel, conversationId: conv.id, requestId: `auto:${draft.id}` }, system, buildDraftMessages(messages as { role: MessageRole; content: string }[]), { json: true });
    } catch (err) {
      return await stopJob(job, payload, err instanceof AiBudgetError ? "el Agente IA está en pausa: se agotó la capacidad de IA del periodo" : "El proveedor de IA no pudo completar la respuesta; requiere atención del equipo.", now, true);
    }
    if ("refused" in result) return await stopJob(job, payload, "el modelo no pudo responder este mensaje", now);
    const decision = parseDecision(result.text);
    if (decision.action === "escalate") return await stopJob(job, payload, decision.reason, now);
    const unsafe = unsafeReason(decision.reply);
    if (unsafe) return await stopJob(job, payload, `la respuesta redactada no pasó la revisión (${unsafe})`, now);

    // Persist the message AND dispatch intent before any external side effect. Crash => human reconciliation, not resend.
    const outbound = await prisma.$transaction(async (tx) => {
      await lockTurn(tx, job.organizationId, conv.id);
      await assertLease(tx, job);
      const eligible = await eligibleTurn(tx, job.organizationId, payload, payload.messageId, new Date());
      const ownDraft = await tx.replyDraft.updateMany({ where: { id: draft.id, organizationId: job.organizationId, status: "GENERATING", updatedAt: draft.updatedAt }, data: eligible ? { status: "USED", content: decision.reply, finalContent: decision.reply, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, usedAt: new Date() } : { status: "DISMISSED", error: "turn_no_longer_eligible" } });
      if (!eligible || !ownDraft.count) { await finishJob(tx, job, "turn_no_longer_eligible"); return null; }
      const message = await tx.message.create({ data: { conversationId: conv.id, role: "ASSISTANT", content: decision.reply, deliveryStatus: "PENDING" } });
      await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: message.createdAt, lastMessagePreview: messagePreview(decision.reply), lastMessageRole: "ASSISTANT" } });
      const next: AutoJobPayload = { ...payload, stage: "dispatching", outboundMessageId: message.id };
      await tx.webhookEvent.updateMany({ where: leaseWhere(job), data: { payload: next } });
      return { message, next };
    });
    if (!outbound) return "skipped";
    payload = outbound.next;
    await observeLegacyCompletion(jobId);
    // Operator UPDATEs use the same row lock. Admission and takeover are serialized across processes.
    const outcome = await prisma.$transaction(async (tx): Promise<AutoOutcome> => {
      await lockTurn(tx, job.organizationId, conv.id);
      await assertLease(tx, job);
      const eligible = await eligibleTurn(tx, job.organizationId, payload, outbound.message.id, new Date());
      if (!eligible) {
        await tx.message.updateMany({ where: { id: outbound.message.id, deliveryStatus: "PENDING" }, data: { deliveryStatus: "FAILED" } });
        await tx.replyDraft.updateMany({ where: { id: draft.id, status: "USED" }, data: { status: "DISMISSED", error: "turn_no_longer_eligible" } });
        await finishJob(tx, job, "turn_no_longer_eligible");
        return "skipped";
      }
      const trigger = await triggerN8nWorkflow(outboundWorkflowPath(conv.channel), {
        organizationId: job.organizationId, event: "message.send",
        data: { conversationId: conv.id, messageId: outbound.message.id, contactPhone: eligible.conv.contactPhone, contactHandle: eligible.conv.contactHandle, contactEmail: eligible.conv.contactEmail, subject: eligible.conv.subject, channel: eligible.conv.channel, content: decision.reply },
      }).catch(() => ({ success: false }));
      const delivery = await tx.message.findUniqueOrThrow({ where: { id: outbound.message.id }, select: { deliveryStatus: true } });
      const accepted = trigger.success || ["SENT", "DELIVERED", "READ"].includes(delivery.deliveryStatus ?? "");
      if (!accepted) {
        await tx.message.updateMany({ where: { id: outbound.message.id, deliveryStatus: "PENDING" }, data: { deliveryStatus: "FAILED" } });
        await tx.conversation.update({ where: { id: conv.id }, data: { status: "ESCALATED", aiHandled: false, escalatedAt: new Date() } });
        await tx.message.create({ data: { conversationId: conv.id, role: "SYSTEM", content: "No se pudo confirmar el envío de IA; revisa la conversación antes de responder. No se reenviará automáticamente." } });
        await tx.replyDraft.update({ where: { id: draft.id }, data: { error: "delivery_unconfirmed" } });
        await tx.auditLog.create({ data: { organizationId: job.organizationId, action: "ai_auto.escalate", resource: "Conversation", resourceId: conv.id, metadata: { reason: "delivery_unconfirmed", messageId: outbound.message.id } } });
      }
      await tx.auditLog.create({ data: { organizationId: job.organizationId, action: "ai_auto.reply", resource: "Conversation", resourceId: conv.id, metadata: { messageId: outbound.message.id, delivered: accepted } } });
      await finishJob(tx, job, accepted ? null : "delivery_unconfirmed");
      return accepted ? "replied" : "escalated";
    }, { timeout: 15_000, maxWait: 5_000 });
    if (outcome === "escalated") await alertEscalation(job.organizationId, conv.id);
    if (outcome === "replied") await recordMetric(job.organizationId, METRIC_KEYS.MESSAGES_SENT).catch(() => undefined);
    return outcome;
  } catch (err) {
    if (err instanceof LeaseLost) return "skipped";
    // Keep durable state, without logging prompts/provider errors. DB-only recovery is bounded to three claims.
    console.error("[ai-auto-reply] work interrupted", { jobId: job.id });
    if (job.attempts >= AUTO_JOB_MAX_ATTEMPTS) {
      try { return await stopJob(job, payload, "La operación de IA se interrumpió repetidamente; requiere atención del equipo.", now, true); } catch { /* DB unavailable: lease remains recoverable */ }
    }
    await prisma.webhookEvent.updateMany({ where: leaseWhere(job), data: { status: "FAILED", errorMessage: "auto_work_interrupted" } }).catch(() => undefined);
    return "skipped";
  }
}

/** One effects owner: the Phase 1 model only observes this Phase 0 worker. */
export async function processAutoReplyJob(jobId: string, opts: { now?: Date } = {}): Promise<AutoOutcome> {
  try { return await processAutoReplyJobInternal(jobId, opts); }
  finally { await observeLegacyCompletion(jobId); }
}

/** Compatibility entry point for the existing fast path. Admission itself is durable at ingestion. */
export async function runAutoReply(organizationId: string, conversationId: string, opts: { now?: Date } = {}): Promise<AutoOutcome> {
  if (!isDraftProviderConfigured()) return "skipped";
  const last = await prisma.message.findFirst({ where: { conversationId, conversation: { organizationId } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  if (!last || last.role !== "USER") return "skipped";
  const job = await prisma.$transaction((tx) => enqueueAutoReply(tx, organizationId, conversationId, last.id));
  return job ? processAutoReplyJob(job.id, opts) : "skipped";
}

/** after is only a latency optimization; the cron can recover accepted work if this process dies. */
export function scheduleAutoReply(organizationId: string, conversationId: string) {
  const job = () => runAutoReply(organizationId, conversationId).then(() => undefined).catch(() => { console.error("[ai-auto-reply] fast path interrupted"); });
  try { after(job); } catch { void job(); }
}

/** Runs outside the automation tick lock; no model call holds its global transaction. */
export async function recoverAutoReplies(opts: { now?: Date; limit?: number; organizationId?: string } = {}) {
  const now = opts.now ?? new Date();
  const stale = new Date(now.getTime() - AUTO_JOB_LEASE_MS);
  const orphans = await prisma.replyDraft.findMany({ where: { status: "GENERATING", updatedAt: { lt: stale }, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}) }, orderBy: { updatedAt: "asc" }, take: opts.limit ?? 3 });
  for (const draft of orphans) {
    await prisma.$transaction(async (tx) => {
      await lockTurn(tx, draft.organizationId, draft.conversationId);
      const existingJob = await tx.webhookEvent.findUnique({ where: { organizationId_source_externalEventId: { organizationId: draft.organizationId, source: AUTO_JOB_SOURCE, externalEventId: `auto:${draft.basedOnMessageId}` } } });
      if (existingJob) return;
      const updated = await tx.replyDraft.updateMany({ where: { id: draft.id, status: "GENERATING", updatedAt: draft.updatedAt }, data: { status: "FAILED", error: "generation_interrupted" } });
      if (!updated.count) return;
      const admitted = await enqueueAutoReply(tx, draft.organizationId, draft.conversationId, draft.basedOnMessageId);
      if (admitted) await tx.webhookEvent.update({ where: { id: admitted.id }, data: { payload: { conversationId: draft.conversationId, messageId: draft.basedOnMessageId, draftId: draft.id, stage: "generating" } } });
    });
  }
  const jobs = await prisma.webhookEvent.findMany({
    where: { source: AUTO_JOB_SOURCE, eventType: AUTO_JOB_TYPE, attempts: { lte: AUTO_JOB_MAX_ATTEMPTS }, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}), OR: [
      { status: "PENDING" },
      { status: "PROCESSING", OR: [{ claimedAt: { lt: stale } }, { claimedAt: null }] },
      { status: "FAILED", attempts: { lte: 1 }, claimedAt: { lte: new Date(now.getTime() - 60_000) } },
      { status: "FAILED", attempts: { gte: 2 }, claimedAt: { lte: new Date(now.getTime() - 5 * 60_000) } },
      { status: "FAILED", claimedAt: null },
    ] }, orderBy: { createdAt: "asc" }, take: opts.limit ?? 3, select: { id: true },
  });
  const result = { recovered: 0, replied: 0, escalated: 0 };
  for (const job of jobs) {
    const outcome = await processAutoReplyJob(job.id, { now });
    result.recovered++;
    if (outcome === "replied") result.replied++;
    if (outcome === "escalated") result.escalated++;
  }
  return result;
}

// ── Probador ─────────────────────────────────────────────────────────────────

export type AgentPreview =
  | { action: "reply"; reply: string }
  /** `kind`: "human" = el cliente pide a una persona; "model" = el agente duda; "guardrail" = la respuesta no pasó la revisión. */
  | { action: "escalate"; reason: string; kind: "human" | "model" | "guardrail"; draftedReply?: string };

/**
 * Qué haría el Agente IA con una conversación de prueba, con las mismas reglas del modo Automático (rulebook,
 * conocimiento y guardarraíles) pero sin enviar nada ni guardar nada. `messages` termina con el mensaje del cliente.
 */
export async function previewAgentReply(organizationId: string, messages: { role: "USER" | "ASSISTANT"; content: string }[], channel = "whatsapp"): Promise<AgentPreview> {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "USER" || !last.content.trim()) throw new Error("empty_conversation");
  if (customerNeedsHuman(last.content)) return { action: "escalate", kind: "human", reason: "el cliente pidió a una persona o trae un tema delicado" };

  const instructions = await buildBusinessInstructions(organizationId);
  const system = [AUTO_PREAMBLE, `BUSINESS RULEBOOK\n${instructions.trim() || "(empty: the business has not written a rulebook, so escalate everything)"}`, `CUSTOMER CONTEXT\nChannel: ${channel}`].join("\n\n");
  const turns = buildDraftMessages(messages as { role: MessageRole; content: string }[]);
  const result = await generateText({ organizationId, agentKey: "probador", operation: "probe", origin: "admin" }, system, turns, { json: true });
  if ("refused" in result) return { action: "escalate", kind: "model", reason: "el modelo no pudo responder este mensaje" };
  const decision = parseDecision(result.text);
  if (decision.action === "escalate") return { action: "escalate", kind: "model", reason: decision.reason };
  const unsafe = unsafeReason(decision.reply);
  if (unsafe) return { action: "escalate", kind: "guardrail", reason: `la respuesta redactada no pasó la revisión (${unsafe})`, draftedReply: decision.reply };
  return { action: "reply", reply: decision.reply };
}
