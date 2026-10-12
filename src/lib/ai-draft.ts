import type Anthropic from "@anthropic-ai/sdk";
import { Prisma, type MessageRole, type ReplyDraft } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { buildBusinessInstructions } from "@/lib/rulebook";
import { getChannelMode } from "@/lib/agent-mode";
import { runAiCall } from "@/lib/ai/gateway";
import type { AiUsageContext } from "@/lib/ai/types";
import { activeProviderName, getProvider } from "@/lib/ai/providers";
import { DEFAULT_ANTHROPIC_MODEL, setAnthropicClientForTests } from "@/lib/ai/providers/anthropic";

// ── Configuración ────────────────────────────────────────────────────────────

/** Modelo que redacta los borradores. Se puede cambiar con AI_DRAFT_MODEL sin tocar código. */
export const DEFAULT_DRAFT_MODEL = DEFAULT_ANTHROPIC_MODEL;
// Incluye el razonamiento del modelo (aunque sea poco con esfuerzo bajo), por eso es holgado.
const MAX_OUTPUT_TOKENS = 4096;
const TRANSCRIPT_LIMIT = 30;
const MESSAGE_CHARS = 2000;
/** Un borrador que lleva más de esto "generando" se considera perdido y se reintenta. */
const STALE_GENERATING_MS = 90_000;

/** ¿Hay con qué generar borradores? (el proveedor activo está configurado, o es el de prueba) */
export function isDraftProviderConfigured(): boolean {
  const name = activeProviderName();
  return name === "mock" || !!getProvider(name)?.isConfigured();
}

// ── Armado de la solicitud (puro) ────────────────────────────────────────────

export type DraftContact = {
  name: string | null;
  channel: string;
  status?: string | null;
  opportunities?: { title: string; stage: string; amount: number | null; currency: string }[];
};
export type DraftMessage = { role: MessageRole; content: string };

const SYSTEM_PREAMBLE = `You write reply drafts for the staff of a small business. A person reads, edits and sends every reply: you never send anything yourself.

Write the reply to the customer's latest message, as the business, in the customer's own language (match Spanish or English).
- Follow the BUSINESS RULEBOOK below exactly; it overrides your own style.
- Only state prices, dates, availability or promises that appear in the rulebook, the business knowledge or the customer context. If you do not have the information, say you will check and get back to them; never invent it.
- Answer the actual question, then suggest one clear next step.
- Keep it as short as the question allows. Plain text only: no markdown, no subject line, no placeholders like [name], no preface and no explanation of what you did.
- Write only the reply text.`;

/** Mensajes en el formato de Claude: empieza y termina con el cliente, y descarta lo que no es conversación. */
export function buildDraftMessages(messages: DraftMessage[]): Anthropic.MessageParam[] {
  const turns: Anthropic.MessageParam[] = [];
  for (const m of messages.slice(-TRANSCRIPT_LIMIT)) {
    if (m.role === "SYSTEM") continue;
    const content = m.content.trim().slice(0, MESSAGE_CHARS);
    if (!content) continue;
    const role = m.role === "USER" ? "user" : "assistant";
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content = `${last.content as string}\n\n${content}`;
    else turns.push({ role, content });
  }
  while (turns.length > 0 && turns[0].role !== "user") turns.shift();
  return turns;
}

/** Prompt de sistema: instrucciones fijas + rulebook/conocimiento del negocio + datos del cliente. */
export function buildDraftSystem(instructions: string, contact: DraftContact): string {
  const customer: string[] = [`Channel: ${contact.channel}`];
  if (contact.name) customer.push(`Name: ${contact.name}`);
  if (contact.status) customer.push(`CRM status: ${contact.status}`);
  for (const o of contact.opportunities ?? []) {
    customer.push(`Open deal: ${o.title} (${o.stage}${o.amount != null ? `, ${o.amount} ${o.currency}` : ""})`);
  }
  return [SYSTEM_PREAMBLE, `BUSINESS RULEBOOK\n${instructions.trim() || "(the business has not written a rulebook yet: stay neutral, polite and brief)"}`, `CUSTOMER CONTEXT\n${customer.join("\n")}`].join("\n\n");
}

// ── Llamada al proveedor ─────────────────────────────────────────────────────

export type DraftResult = { text: string; model: string; inputTokens: number; outputTokens: number } | { refused: true; model: string };

/** Solo para pruebas: reemplaza el cliente de Claude. */
export const setDraftClientForTests = setAnthropicClientForTests;

/**
 * Llamada al modelo (por el gateway, que registra el uso del tenant) o al proveedor de prueba. Con `json` el de prueba
 * responde con la decisión del modo automático.
 */
export async function generateText(usage: AiUsageContext, system: string, messages: Anthropic.MessageParam[], opts: { json?: boolean; mockText?: string } = {}): Promise<DraftResult> {
  if (activeProviderName() === "mock") {
    if (opts.json && opts.mockText) return { text: opts.mockText, model: "mock", inputTokens: 0, outputTokens: 0 };
    if (opts.json) return { text: JSON.stringify({ action: "reply", reply: "Hola, gracias por escribirnos. En un momento te ayudamos con tu consulta." }), model: "mock", inputTokens: 0, outputTokens: 0 };
    const last = (messages[messages.length - 1]?.content as string | undefined) ?? "";
    return { text: `Hola, gracias por escribirnos. Sobre "${last.slice(0, 60).trim()}": con gusto te ayudamos. ¿Te parece si agendamos una llamada para darte el detalle?`, model: "mock", inputTokens: 0, outputTokens: 0 };
  }
  return runAiCall(usage, { system, messages: messages as { role: "user" | "assistant"; content: string }[], maxOutputTokens: MAX_OUTPUT_TOKENS });
}

// ── Borrador de una conversación ─────────────────────────────────────────────

export type DraftState =
  | { state: "off" }
  | { state: "none" }
  /** Otra petición lo está redactando: conviene volver a preguntar en unos segundos. */
  | { state: "generating" }
  | { state: "ready"; draft: { id: string; content: string } }
  | { state: "failed" };

/** ¿Hay borradores para este canal? (módulo de IA, clave configurada y el agente no está apagado en ese canal) */
export async function draftsAvailable(organizationId: string, channel: string): Promise<boolean> {
  if (!isDraftProviderConfigured()) return false;
  if (!(await hasModule(organizationId, "AI_WHATSAPP"))) return false;
  return (await getChannelMode(organizationId, channel)) !== "OFF";
}

function toState(draft: ReplyDraft): DraftState {
  if (draft.status === "READY" && draft.content) return { state: "ready", draft: { id: draft.id, content: draft.content } };
  if (draft.status === "FAILED") return { state: "failed" };
  if (draft.status === "GENERATING") return { state: "generating" };
  return { state: "none" };
}

/**
 * Borrador para el último mensaje del cliente de una conversación: devuelve el que ya existe o lo redacta
 * (una sola vez por mensaje; dos peticiones a la vez no generan dos). Si lo último lo dijo el negocio, no hay
 * nada que responder ("none"). Con `force` se descarta el actual y se redacta otra versión.
 */
export async function getOrCreateReplyDraft(organizationId: string, conversationId: string, opts: { force?: boolean; now?: Date } = {}): Promise<DraftState> {
  const now = opts.now ?? new Date();

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId },
    include: {
      lead: { select: { status: true, opportunities: { where: { closedAt: null }, select: { title: true, amount: true, currency: true, pipelineStage: { select: { name: true } } }, take: 5 } } },
    },
  });
  if (!conversation) return { state: "none" };
  if (!(await draftsAvailable(organizationId, conversation.channel))) return { state: "off" };

  const recent = await prisma.message.findMany({ where: { conversationId }, orderBy: { createdAt: "desc" }, take: TRANSCRIPT_LIMIT, select: { id: true, role: true, content: true } });
  const messages = recent.reverse();
  const last = messages[messages.length - 1];
  if (!last || last.role !== "USER") return { state: "none" };

  let draft = await prisma.replyDraft.findUnique({ where: { conversationId_basedOnMessageId: { conversationId, basedOnMessageId: last.id } } });
  if (draft && !opts.force) {
    if (draft.status === "READY" || draft.status === "USED" || draft.status === "DISMISSED") return draft.status === "READY" ? toState(draft) : { state: "none" };
    if (draft.status === "FAILED") return toState(draft);
    if (now.getTime() - draft.updatedAt.getTime() < STALE_GENERATING_MS) return { state: "generating" }; // otra petición lo está redactando
  }

  // Reserva el turno de generación (la llave única impide que dos peticiones redacten lo mismo a la vez).
  try {
    draft = draft
      ? await prisma.replyDraft.update({ where: { id: draft.id }, data: { status: "GENERATING", content: "", error: null, finalContent: null, usedAt: null, usedById: null } })
      : await prisma.replyDraft.create({ data: { organizationId, conversationId, basedOnMessageId: last.id, status: "GENERATING" } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { state: "generating" };
    throw err;
  }

  try {
    const instructions = await buildBusinessInstructions(organizationId);
    const system = buildDraftSystem(instructions, {
      name: conversation.contactName,
      channel: conversation.channel,
      status: conversation.lead?.status ?? null,
      opportunities: conversation.lead?.opportunities.map((o) => ({ title: o.title, stage: o.pipelineStage.name, amount: o.amount, currency: o.currency })),
    });
    const turns = buildDraftMessages(messages);
    if (turns.length === 0) throw new Error("no_messages");

    const result = await generateText({ organizationId, agentKey: `inbox:${conversation.channel}`, operation: "draft", origin: conversation.channel, conversationId, requestId: `draft:${draft.id}:${draft.updatedAt.getTime()}` }, system, turns);
    if ("refused" in result) {
      draft = await prisma.replyDraft.update({ where: { id: draft.id }, data: { status: "FAILED", model: result.model, error: "refusal" } });
    } else if (!result.text) {
      draft = await prisma.replyDraft.update({ where: { id: draft.id }, data: { status: "FAILED", model: result.model, error: "empty" } });
    } else {
      draft = await prisma.replyDraft.update({ where: { id: draft.id }, data: { status: "READY", content: result.text, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, error: null } });
    }
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    draft = await prisma.replyDraft.update({ where: { id: draft.id }, data: { status: "FAILED", error: message } });
  }
  return toState(draft);
}

/** La persona descartó el borrador. */
export async function dismissReplyDraft(organizationId: string, draftId: string): Promise<boolean> {
  const { count } = await prisma.replyDraft.updateMany({ where: { id: draftId, organizationId, status: { in: ["READY", "FAILED", "GENERATING"] } }, data: { status: "DISMISSED" } });
  return count > 0;
}

/** Se envió una respuesta partiendo de este borrador (con o sin ediciones): queda registro de qué se mandó. */
export async function markReplyDraftUsed(organizationId: string, draftId: string, userId: string, finalContent: string): Promise<boolean> {
  const { count } = await prisma.replyDraft.updateMany({ where: { id: draftId, organizationId, status: "READY" }, data: { status: "USED", finalContent, usedById: userId, usedAt: new Date() } });
  return count > 0;
}
