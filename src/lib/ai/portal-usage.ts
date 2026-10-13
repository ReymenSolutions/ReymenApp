import { prisma } from "@/lib/prisma";
import { getPlan } from "@/lib/plans";
import { getBudgetState, isBudgetBlocked } from "./budget";

// ─── «Mi consumo de IA» (portal) ─────────────────────────────────────────────────────────────────────────────────
// Solo información COMERCIAL: porcentajes, fechas y estado. Nunca montos en pesos del presupuesto interno, costos de
// proveedor, modelos, llaves ni datos de otros clientes. El presupuesto interno (en MXN) vive solo en Admin.

export type PortalAiUsage = {
  planKey: string;
  planName: string;
  planNameEn: string;
  /** Capacidad usada del ciclo, 0–100 (se topa en 100). */
  usedPercent: number;
  remainingPercent: number;
  /** Fecha de renovación (fin del ciclo; el consumo vuelve a cero). */
  renewsAt: Date;
  cycleStart: Date;
  status: "OK" | "WARN_75" | "CRITICAL_90" | "EXHAUSTED";
  /** Los agentes están en pausa por capacidad agotada (temporal). */
  paused: boolean;
  /** Ciclos anteriores, del más reciente al más antiguo. */
  history: { cycleStart: Date; cycleEnd: Date; usedPercent: number }[];
  /** Avisos de este ciclo (umbrales alcanzados que importan al cliente). */
  alerts: { threshold: number; at: Date }[];
  /** Hay una solicitud de capacidad adicional abierta. */
  pendingRequest: boolean;
};

const HISTORY_CYCLES = 5;
const cap100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function getPortalAiUsage(organizationId: string, now: Date = new Date()): Promise<PortalAiUsage> {
  const [org, state] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true, createdAt: true } }),
    getBudgetState(organizationId, now),
  ]);
  const [plan, paused, alerts, pendingRequest] = await Promise.all([
    getPlan(org.plan),
    isBudgetBlocked(organizationId, now),
    prisma.aiBudgetAlert.findMany({ where: { organizationId, cycleStart: state.cycleStart, threshold: { gte: 75 } }, orderBy: { threshold: "asc" }, select: { threshold: true, createdAt: true } }),
    prisma.request.count({ where: { organizationId, type: "ai_capacity", status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);

  const history: PortalAiUsage["history"] = [];
  let cursor = state.cycleStart;
  for (let i = 0; i < HISTORY_CYCLES && cursor > org.createdAt; i++) {
    const past = await getBudgetState(organizationId, new Date(cursor.getTime() - 1));
    history.push({ cycleStart: past.cycleStart, cycleEnd: past.cycleEnd, usedPercent: cap100(past.percent) });
    cursor = past.cycleStart;
  }

  const used = cap100(state.percent);
  return {
    planKey: plan.key,
    planName: plan.name,
    planNameEn: plan.nameEn,
    usedPercent: used,
    remainingPercent: 100 - used,
    renewsAt: state.cycleEnd,
    cycleStart: state.cycleStart,
    status: state.status === "WARN_50" ? "OK" : state.status,
    paused,
    history,
    alerts: alerts.map((a) => ({ threshold: a.threshold, at: a.createdAt })),
    pendingRequest: pendingRequest > 0,
  };
}
