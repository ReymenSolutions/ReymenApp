import type { AgentMode } from "@prisma/client";
import { getAgentModes } from "@/lib/agent-mode";
import { isBudgetBlocked } from "./budget";

/**
 * Qué está pasando de verdad con cada agente de un tenant. "Apagado" y "bloqueado por presupuesto" son cosas distintas:
 * lo primero lo decidió una persona y se queda así hasta que alguien lo cambie; lo segundo es temporal, lo impone el
 * presupuesto del ciclo y se levanta solo (ciclo nuevo, ampliación o recarga) SIN tocar la configuración del agente.
 */
export type AgentRuntimeStatus = "OFF_MANUAL" | "BUDGET_EXHAUSTED" | "ACTIVE";

export type AgentStatusRow = { agentKey: string; label: string; configuredMode: AgentMode | null; runtime: AgentRuntimeStatus };

export async function getAgentStatuses(organizationId: string, now: Date = new Date()): Promise<{ blocked: boolean; agents: AgentStatusRow[] }> {
  const [modes, blocked] = await Promise.all([getAgentModes(organizationId), isBudgetBlocked(organizationId, now)]);
  const channelRows: AgentStatusRow[] = Object.entries(modes).map(([channel, mode]) => ({
    agentKey: `inbox:${channel}`,
    label: channel,
    configuredMode: mode,
    runtime: mode === "OFF" ? "OFF_MANUAL" : blocked ? "BUDGET_EXHAUSTED" : "ACTIVE",
  }));
  // El pipeline con IA no tiene interruptor propio: solo lo detiene el presupuesto.
  const pipeline: AgentStatusRow = { agentKey: "pipeline", label: "pipeline", configuredMode: null, runtime: blocked ? "BUDGET_EXHAUSTED" : "ACTIVE" };
  return { blocked, agents: [...channelRows, pipeline] };
}
