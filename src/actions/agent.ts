"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";
import { INBOX_CHANNELS } from "@/lib/channels";
import { SELECTABLE_AGENT_MODES, isAgentMode, setChannelMode } from "@/lib/agent-mode";
import type { UserRole } from "@prisma/client";

/** Cambia lo que hace el Agente IA en un canal: apagado, sugerir o (próximamente) automático. */
export async function setAgentChannelMode(channel: string, mode: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "knowledge_base:manage")) throw new UserError("No autorizado");
  const organizationId = session.user.organizationId;
  await assertModuleEnabled(organizationId, "AI_WHATSAPP");

  if (!(INBOX_CHANNELS as readonly string[]).includes(channel)) throw new UserError("Canal no válido");
  if (!isAgentMode(mode) || !SELECTABLE_AGENT_MODES.includes(mode)) throw new UserError("Modo no válido");

  await setChannelMode(organizationId, channel, mode, session.user.id);
  await logAudit({ organizationId, userId: session.user.id, action: "agent.mode", resource: "AgentChannelSetting", resourceId: channel, metadata: { channel, mode } });
  revalidatePath("/portal/whatsapp");
  revalidatePath("/portal/knowledge-base");
  return { success: true };
}
