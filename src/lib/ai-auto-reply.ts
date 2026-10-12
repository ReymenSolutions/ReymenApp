import { after } from "next/server";
import { Prisma, type MessageRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { triggerN8nWorkflow } from "@/lib/n8n";
import { recordMetric, METRIC_KEYS } from "@/lib/metrics";
import { outboundWorkflowPath, messagePreview } from "@/lib/channels";
import { buildBusinessInstructions } from "@/lib/rulebook";
import { getChannelMode } from "@/lib/agent-mode";
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

/**
 * Responde solo al último mensaje del cliente de una conversación, si el canal está en modo Automático. Una vez por
 * mensaje (la llave única de `ReplyDraft` lo garantiza). Devuelve qué hizo; nunca lanza: un fallo deja la
 * conversación para una persona.
 */
export async function runAutoReply(organizationId: string, conversationId: string, opts: { now?: Date } = {}): Promise<AutoOutcome> {
  const now = opts.now ?? new Date();
  try {
    if (!isDraftProviderConfigured() || !(await hasModule(organizationId, "AI_WHATSAPP"))) return "skipped";
    const conv = await prisma.conversation.findFirst({ where: { id: conversationId, organizationId } , include: { lead: { select: { status: true, opportunities: { where: { closedAt: null }, select: { title: true, amount: true, currency: true, pipelineStage: { select: { name: true } } }, take: 5 } } } } });
    if (!conv || conv.status !== "OPEN") return "skipped";
    if ((await getChannelMode(organizationId, conv.channel)) !== "AUTO") return "skipped";

    const recent = await prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, role: true, content: true, createdAt: true } });
    const messages = recent.reverse();
    const last = messages[messages.length - 1];
    if (!last || last.role !== "USER") return "skipped";

    // Una persona ya está atendiendo: el agente no se mete.
    if (messages.some((m) => m.role === "AGENT" && now.getTime() - m.createdAt.getTime() < HUMAN_ACTIVE_MS)) return "skipped";

    // Una sola vez por mensaje del cliente.
    let draft;
    try {
      draft = await prisma.replyDraft.create({ data: { organizationId, conversationId, basedOnMessageId: last.id, status: "GENERATING" } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "skipped";
      throw err;
    }

    const escalate = async (reason: string): Promise<AutoOutcome> => {
      await prisma.replyDraft.update({ where: { id: draft.id }, data: { status: "DISMISSED", error: `escalated:${reason}`.slice(0, 300) } });
      await prisma.conversation.update({ where: { id: conv.id }, data: { status: "ESCALATED" } });
      await prisma.message.create({ data: { conversationId: conv.id, role: "SYSTEM", content: `El Agente IA pasó esta conversación a una persona: ${reason}` } });
      await logAudit({ organizationId, action: "ai_auto.escalate", resource: "Conversation", resourceId: conv.id, metadata: { reason } });
      return "escalated";
    };

    if (customerNeedsHuman(last.content)) return escalate("el cliente pidió a una persona o trae un tema delicado");

    const sentLastHour = await prisma.message.count({ where: { conversationId, role: "ASSISTANT", createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) } } });
    if (sentLastHour >= AUTO_REPLIES_PER_HOUR) return escalate("demasiadas respuestas automáticas seguidas en esta conversación");

    const instructions = await buildBusinessInstructions(organizationId);
    const customer = [`Channel: ${conv.channel}`, ...(conv.contactName ? [`Name: ${conv.contactName}`] : []), ...(conv.lead?.status ? [`CRM status: ${conv.lead.status}`] : [])];
    const system = [AUTO_PREAMBLE, `BUSINESS RULEBOOK\n${instructions.trim() || "(empty: the business has not written a rulebook, so escalate everything)"}`, `CUSTOMER CONTEXT\n${customer.join("\n")}`].join("\n\n");
    const turns = buildDraftMessages(messages as { role: MessageRole; content: string }[]);

    let result;
    try {
      result = await generateText({ organizationId, agentKey: `inbox:${conv.channel}`, operation: "auto_reply", origin: conv.channel, conversationId, requestId: `auto:${draft.id}` }, system, turns, { json: true });
    } catch (err) {
      // Pausa temporal por presupuesto: el cliente no se queda sin respuesta, la conversación pasa a una persona.
      if (err instanceof AiBudgetError) return escalate("el Agente IA está en pausa: se agotó la capacidad de IA del periodo");
      throw err;
    }
    if ("refused" in result) return escalate("el modelo no pudo responder este mensaje");
    const decision = parseDecision(result.text);
    if (decision.action === "escalate") return escalate(decision.reason);
    const unsafe = unsafeReason(decision.reply);
    if (unsafe) return escalate(`la respuesta redactada no pasó la revisión (${unsafe})`);

    const message = await prisma.message.create({ data: { conversationId: conv.id, role: "ASSISTANT", content: decision.reply, deliveryStatus: "PENDING" } });
    await prisma.conversation.update({ where: { id: conv.id }, data: { aiHandled: true, lastMessageAt: now, lastMessagePreview: messagePreview(decision.reply), lastMessageRole: "ASSISTANT" } });
    await prisma.replyDraft.update({ where: { id: draft.id }, data: { status: "USED", content: decision.reply, finalContent: decision.reply, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, usedAt: now } });
    await recordMetric(organizationId, METRIC_KEYS.MESSAGES_SENT);

    const trigger = await triggerN8nWorkflow(outboundWorkflowPath(conv.channel), {
      organizationId,
      event: "message.send",
      data: { conversationId: conv.id, messageId: message.id, contactPhone: conv.contactPhone, contactHandle: conv.contactHandle, contactEmail: conv.contactEmail, subject: conv.subject, channel: conv.channel, content: decision.reply },
    });
    if (!trigger.success) await prisma.message.update({ where: { id: message.id }, data: { deliveryStatus: "FAILED" } });
    await logAudit({ organizationId, action: "ai_auto.reply", resource: "Conversation", resourceId: conv.id, metadata: { messageId: message.id, delivered: trigger.success } });
    return "replied";
  } catch (err) {
    console.error("[ai-auto-reply] failed", err);
    return "skipped";
  }
}

/** Programa la respuesta automática para después de contestarle al webhook (sin hacer esperar a n8n). */
export function scheduleAutoReply(organizationId: string, conversationId: string) {
  const job = () => runAutoReply(organizationId, conversationId).then(() => undefined);
  try {
    after(job);
  } catch {
    // Fuera de una petición (pruebas, scripts): se lanza igual sin bloquear.
    void job();
  }
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
