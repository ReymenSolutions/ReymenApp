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
