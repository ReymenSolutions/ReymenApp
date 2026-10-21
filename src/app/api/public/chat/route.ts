import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasModule } from "@/lib/modules";
import { getChannelMode } from "@/lib/agent-mode";
import { isDraftProviderConfigured } from "@/lib/ai-draft";
import { previewAgentReply } from "@/lib/ai-auto-reply";
import { AiBudgetError } from "@/lib/ai/budget";
import { processConversationEvent } from "@/lib/webhook-processors";
import { ipLimited, jsonWithCors, originRejected, preflight, webOrg } from "@/lib/public-api";

export const OPTIONS = preflight;

const MAX_MESSAGES_PER_SESSION = 20;

const schema = z.object({
  sessionId: z.string().trim().regex(/^[A-Za-z0-9_-]{16,64}$/),
  message: z.string().trim().min(1).max(500),
});

const HANDOFF = "Para atenderte mejor, una persona del equipo te contactará. Déjanos tu WhatsApp o correo en el formulario y te escribimos.";

/**
 * Chat del sitio → canal "webchat" del Inbox de Reymen. Responde el Agente IA con las mismas reglas y guardarraíles del
 * modo Automático; si duda, se agota la IA o el visitante pide a una persona, la conversación pasa a ESCALATED y el
 * visitante recibe `handoff: true`. Nunca depende de n8n: la respuesta se genera y se guarda aquí.
 */
export async function POST(req: NextRequest) {
  const rejected = originRejected(req);
  if (rejected) return rejected;
  const limited = await ipLimited(req, "chat", 20, 10 * 60 * 1000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonWithCors(req, { error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return jsonWithCors(req, { error: "Invalid data" }, { status: 400 });
  const { sessionId, message } = parsed.data;

  const bySession = await checkRateLimit(`public:chat-session:${sessionId}`, { limit: 15, windowMs: 60 * 60 * 1000 });
  if (!bySession.allowed) return jsonWithCors(req, { error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(bySession.retryAfterSeconds ?? 60) } });

  const org = await webOrg();
  if (!org) return jsonWithCors(req, { error: "Not configured" }, { status: 503 });
  if (!(await hasModule(org.id, "AI_WHATSAPP")) || (await getChannelMode(org.id, "webchat")) === "OFF" || !isDraftProviderConfigured()) {
    return jsonWithCors(req, { error: "Chat unavailable" }, { status: 503 });
  }

  const handle = `web:${sessionId}`;
  const existing = await prisma.conversation.findFirst({ where: { organizationId: org.id, channel: "webchat", contactHandle: handle, status: { in: ["OPEN", "ESCALATED"] } }, select: { id: true, status: true } });
  if (existing?.status === "ESCALATED") {
    // Ya lo atiende una persona: se guarda el mensaje y no responde la IA.
    await processConversationEvent({ conversationId: existing.id, channel: "webchat", message: { role: "USER", content: message } }, org.id);
    return jsonWithCors(req, { reply: null, handoff: true, notice: HANDOFF });
  }
  if (existing && (await prisma.message.count({ where: { conversationId: existing.id, role: "USER" } })) >= MAX_MESSAGES_PER_SESSION) {
    return jsonWithCors(req, { error: "Session limit reached" }, { status: 429 });
  }

  const { conversationId } = await processConversationEvent(
    { conversationId: existing?.id, channel: "webchat", contactHandle: handle, contactName: "Visitante web", subject: "Chat del sitio", message: { role: "USER", content: message } },
    org.id
  );

  const history = await prisma.message.findMany({ where: { conversationId, role: { in: ["USER", "ASSISTANT"] } }, orderBy: { createdAt: "desc" }, take: 20, select: { role: true, content: true } });
  const turns = history.reverse() as { role: "USER" | "ASSISTANT"; content: string }[];

  const escalate = async (reason: string) => {
    await prisma.conversation.update({ where: { id: conversationId }, data: { status: "ESCALATED" } });
    await prisma.message.create({ data: { conversationId, role: "SYSTEM", content: `El Agente IA pasó esta conversación a una persona: ${reason}` } });
    return jsonWithCors(req, { reply: null, handoff: true, notice: HANDOFF });
  };

  let outcome;
  try {
    outcome = await previewAgentReply(org.id, turns, "webchat");
  } catch (err) {
    return escalate(err instanceof AiBudgetError ? "el Agente IA está en pausa: se agotó la capacidad de IA del periodo" : "el Agente IA no pudo responder");
  }
  if (outcome.action === "escalate") return escalate(outcome.reason);

  await processConversationEvent({ conversationId, channel: "webchat", message: { role: "ASSISTANT", content: outcome.reply } }, org.id);
  return jsonWithCors(req, { reply: outcome.reply, handoff: false });
}

export function GET(req: NextRequest) {
  return jsonWithCors(req, { error: "Method not allowed" }, { status: 405 });
}
