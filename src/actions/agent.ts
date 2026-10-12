"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";
import { INBOX_CHANNELS } from "@/lib/channels";
import { isAgentMode, setChannelMode } from "@/lib/agent-mode";
import { getRulebook, rulebookProgress } from "@/lib/rulebook";
import { checkRateLimit } from "@/lib/rate-limit";
import { isDraftProviderConfigured } from "@/lib/ai-draft";
import { previewAgentReply, type AgentPreview } from "@/lib/ai-auto-reply";
import type { UserRole } from "@prisma/client";

/**
 * Cambia lo que hace el Agente IA en un canal: apagado, sugerir o automático. El automático responde sin que nadie
 * revise, así que exige confirmación explícita y que el negocio ya tenga escrito su Rulebook.
 */
export async function setAgentChannelMode(channel: string, mode: string, opts: { confirmed?: boolean } = {}) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "knowledge_base:manage")) throw new UserError("No autorizado");
  const organizationId = session.user.organizationId;
  await assertModuleEnabled(organizationId, "AI_WHATSAPP");

  if (!(INBOX_CHANNELS as readonly string[]).includes(channel)) throw new UserError("Canal no válido");
  if (!isAgentMode(mode)) throw new UserError("Modo no válido");
  if (mode === "AUTO") {
    if (!opts.confirmed) throw new UserError("Confirma que el agente responda solo en este canal");
    if (rulebookProgress(await getRulebook(organizationId)).filled === 0) throw new UserError("Escribe tu Rulebook antes de activar el modo automático");
  }

  await setChannelMode(organizationId, channel, mode, session.user.id);
  await logAudit({ organizationId, userId: session.user.id, action: "agent.mode", resource: "AgentChannelSetting", resourceId: channel, metadata: { channel, mode } });
  revalidatePath("/portal/whatsapp");
  revalidatePath("/portal/knowledge-base");
  return { success: true };
}

const TEST_MESSAGES_LIMIT = 20;
const TEST_CHARS = 1000;

/**
 * Probador del Agente IA: qué respondería (o a quién pasaría) con el Rulebook y la base de conocimiento actuales.
 * No envía ni guarda nada. Cuesta una llamada a Claude, así que tiene límite por persona.
 */
export async function testAgentReply(messages: { role: "USER" | "ASSISTANT"; content: string }[], channel = "whatsapp"): Promise<AgentPreview> {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "knowledge_base:manage")) throw new UserError("No autorizado");
  const organizationId = session.user.organizationId;
  await assertModuleEnabled(organizationId, "AI_WHATSAPP");
  if (!isDraftProviderConfigured()) throw new UserError("La IA no está configurada en el servidor");

  const clean = (Array.isArray(messages) ? messages : [])
    .filter((m) => (m?.role === "USER" || m?.role === "ASSISTANT") && typeof m.content === "string" && m.content.trim())
    .slice(-TEST_MESSAGES_LIMIT)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, TEST_CHARS) }));
  if (clean.length === 0 || clean[clean.length - 1].role !== "USER") throw new UserError("Escribe un mensaje del cliente");

  const limit = await checkRateLimit(`agent-test:${session.user.id}`, { limit: 20, windowMs: 60_000 });
  if (!limit.allowed) throw new UserError("Demasiadas pruebas seguidas, espera un momento");

  return previewAgentReply(organizationId, clean, (INBOX_CHANNELS as readonly string[]).includes(channel) ? channel : "whatsapp");
}
