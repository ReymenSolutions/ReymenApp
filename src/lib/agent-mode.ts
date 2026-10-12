import type { AgentMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INBOX_CHANNELS, normalizeChannel } from "@/lib/channels";

/** Sin configuración, el Agente IA sugiere borradores: nunca contesta solo sin que el dueño lo active. */
export const DEFAULT_AGENT_MODE: AgentMode = "SUGGEST";
export const AGENT_MODES: readonly AgentMode[] = ["OFF", "SUGGEST", "AUTO"];
/** Modos que ya se pueden elegir (AUTO llega en su propio cambio). */
export const SELECTABLE_AGENT_MODES: readonly AgentMode[] = ["OFF", "SUGGEST"];

export function isAgentMode(value: unknown): value is AgentMode {
  return typeof value === "string" && (AGENT_MODES as readonly string[]).includes(value);
}

/** Modo de cada canal del inbox (los que no tienen fila usan el modo por defecto). */
export async function getAgentModes(organizationId: string): Promise<Record<string, AgentMode>> {
  const rows = await prisma.agentChannelSetting.findMany({ where: { organizationId }, select: { channel: true, mode: true } });
  const byChannel = new Map(rows.map((r) => [r.channel, r.mode]));
  const out: Record<string, AgentMode> = {};
  for (const channel of INBOX_CHANNELS) out[channel] = byChannel.get(channel) ?? DEFAULT_AGENT_MODE;
  return out;
}

export async function getChannelMode(organizationId: string, channel: string): Promise<AgentMode> {
  const row = await prisma.agentChannelSetting.findUnique({ where: { organizationId_channel: { organizationId, channel: normalizeChannel(channel) } }, select: { mode: true } });
  return row?.mode ?? DEFAULT_AGENT_MODE;
}

export async function setChannelMode(organizationId: string, channel: string, mode: AgentMode, userId: string) {
  const name = normalizeChannel(channel);
  await prisma.agentChannelSetting.upsert({
    where: { organizationId_channel: { organizationId, channel: name } },
    create: { organizationId, channel: name, mode, updatedById: userId },
    update: { mode, updatedById: userId },
  });
  // El interruptor "activo" del asistente (lo lee el onboarding y n8n) refleja si el agente atiende algún canal.
  const modes = await getAgentModes(organizationId);
  const active = Object.values(modes).some((m) => m !== "OFF");
  await prisma.whatsAppAssistant.updateMany({ where: { organizationId }, data: { isActive: active } });
}
