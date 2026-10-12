import type { AgentMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { INBOX_CHANNELS } from "@/lib/channels";
import { DEFAULT_AGENT_MODE, getAgentModes } from "@/lib/agent-mode";
import { getPlan } from "@/lib/plans";
import { UserError } from "@/lib/user-error";

// ─── Tope de agentes IA activos ──────────────────────────────────────────────────────────────────────────────────
// Un "agente" es un canal del inbox (WhatsApp, Instagram, Messenger, chat web, correo, consultas) en modo SUGGEST o AUTO.
// La IA del pipeline no cuenta. El tope viene del plan (`Plan.maxAiAgents`) o, si un admin lo pactó, del cliente
// (`Organization.aiAgentsCapOverride`). Solo BLOQUEA encender un canal apagado: nunca apaga nada por su cuenta, así que un
// cliente que ya está por encima conserva lo que tiene pero no puede activar más.

export type AgentCap = {
  /** Tope vigente; null = sin tope. */
  cap: number | null;
  source: "override" | "plan";
  /** Agentes activos hoy. */
  active: number;
  /** Cuántos tiene de más respecto al tope (0 si cumple). */
  overBy: number;
};

export const countActiveAgents = (modes: Record<string, AgentMode>) => Object.values(modes).filter((m) => m !== "OFF").length;

export async function getAgentCap(organizationId: string): Promise<AgentCap> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { plan: true, aiAgentsCapOverride: true } });
  if (!org) throw new UserError("Cliente no encontrado");
  const [plan, modes] = await Promise.all([getPlan(org.plan), getAgentModes(organizationId)]);
  const override = org.aiAgentsCapOverride;
  const cap = override !== null ? override : plan.maxAiAgents;
  const active = countActiveAgents(modes);
  return { cap, source: override !== null ? "override" : "plan", active, overBy: cap === null ? 0 : Math.max(0, active - cap) };
}

/**
 * Valida que se pueda pasar un canal de apagado a SUGGEST/AUTO. Cambiar entre SUGGEST y AUTO, o apagar, nunca se bloquea.
 * Lanza UserError si el cliente ya está en su tope (o por encima).
 */
export async function assertAgentCapacity(organizationId: string, channel: string, nextMode: AgentMode) {
  if (nextMode === "OFF") return;
  const modes = await getAgentModes(organizationId);
  if ((modes[channel] ?? DEFAULT_AGENT_MODE) !== "OFF") return;
  const { cap, active } = await getAgentCap(organizationId);
  if (cap !== null && active >= cap) throw new UserError(`Tu plan incluye ${cap} ${cap === 1 ? "agente IA activo" : "agentes IA activos"}; apaga uno o mejora tu plan`);
}

/** Estado inicial de un cliente nuevo: solo WhatsApp atiende (sugiriendo borradores); el resto queda apagado hasta que se active. */
export const NEW_ORG_AGENT_SETTINGS = INBOX_CHANNELS.map((channel) => ({ channel, mode: (channel === "whatsapp" ? "SUGGEST" : "OFF") as AgentMode }));

export type OverCapRow = { orgId: string; name: string; plan: string; active: number; cap: number; source: "override" | "plan" };

/** Clientes por encima de su tope (para Admin → Planes). */
export async function listOrgsOverAgentCap(): Promise<OverCapRow[]> {
  const [orgs, settings] = await Promise.all([
    prisma.organization.findMany({ select: { id: true, name: true, plan: true, aiAgentsCapOverride: true } }),
    prisma.agentChannelSetting.findMany({ select: { organizationId: true, channel: true, mode: true } }),
  ]);
  const byOrg = new Map<string, Map<string, AgentMode>>();
  for (const s of settings) (byOrg.get(s.organizationId) ?? byOrg.set(s.organizationId, new Map()).get(s.organizationId)!).set(s.channel, s.mode);
  const out: OverCapRow[] = [];
  for (const o of orgs) {
    const plan = await getPlan(o.plan);
    const cap = o.aiAgentsCapOverride !== null ? o.aiAgentsCapOverride : plan.maxAiAgents;
    if (cap === null) continue;
    const rows = byOrg.get(o.id);
    const active = INBOX_CHANNELS.filter((c) => (rows?.get(c) ?? DEFAULT_AGENT_MODE) !== "OFF").length;
    if (active > cap) out.push({ orgId: o.id, name: o.name, plan: o.plan, active, cap, source: o.aiAgentsCapOverride !== null ? "override" : "plan" });
  }
  return out.sort((a, b) => b.active - b.cap - (a.active - a.cap));
}
