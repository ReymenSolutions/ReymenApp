import { prisma } from "./prisma";
import { hasModule } from "./modules";
import { getFoodLowStockItems, getFoodSalesSummary, type FoodLowStockEntry } from "./food";
import { fetchPosSnapshot } from "./pos-operations";
import { filterSnapshotByBranch, summarizeOperations, type OperationsSummary } from "./pos-operations-summary";
import type { BranchFilter } from "./branches";
import { FINISHED_STATUSES, isDeliveryLate } from "./delivery";

// Datos del centro de operaciones (Food → Operación): lo que pasa ahora en
// el POS (mesas, cocina, cajas) más lo que Reymen ya sabe (ventas
// registradas, inventario, automatizaciones). Si el POS no está disponible
// la página sigue mostrando la parte de Reymen.

export type PosState =
  | { kind: "disabled" }
  | { kind: "unauthorized" }
  | { kind: "unreachable" }
  | { kind: "ok"; summary: OperationsSummary; serverTime: string };

export interface OperationsData {
  /** Hora de referencia para "hace X min" (la del POS si respondió). */
  now: number;
  pos: PosState;
  reymenToday: { gross: number; count: number };
  lowStock: FoodLowStockEntry[];
  automations: {
    active: number;
    paused: number;
    error: number;
    failed24h: number;
    recentFailures: { id: string; automation: string; message: string | null; at: Date }[];
  };
  posRejected24h: number;
  /** Uber Eats / Rappi / DiDi en curso y retrasados (Food → Delivery). */
  delivery: { active: number; late: number };
}

const DAY_MS = 24 * 3600_000;

export async function getOperationsData(organizationId: string, branch?: BranchFilter): Promise<OperationsData> {
  const since = new Date(Date.now() - DAY_MS);
  const [org, posEnabled, summary, lowStock, automationGroups, failed24h, recentFailures, posRejected24h, deliveryActive] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { n8nWebhookSecret: true } }),
    hasModule(organizationId, "REYMEN_POS"),
    getFoodSalesSummary(organizationId, branch),
    getFoodLowStockItems(organizationId, 8),
    prisma.automation.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.automationEvent.count({ where: { organizationId, status: "FAILED", createdAt: { gte: since } } }),
    prisma.automationEvent.findMany({
      where: { organizationId, status: "FAILED", createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, errorMessage: true, createdAt: true, automation: { select: { name: true } } },
    }),
    prisma.webhookEvent.count({ where: { organizationId, source: "pos", status: "FAILED", createdAt: { gte: since } } }),
    prisma.deliveryOrder.findMany({
      where: { organizationId, status: { notIn: FINISHED_STATUSES } },
      select: { status: true, placedAt: true },
    }),
  ]);

  let pos: PosState = { kind: "disabled" };
  if (posEnabled) {
    const result = await fetchPosSnapshot(organizationId, org.n8nWebhookSecret);
    pos =
      result.kind === "ok"
        ? { kind: "ok", summary: summarizeOperations(filterSnapshotByBranch(result.snapshot, branch)), serverTime: result.snapshot.serverTime }
        : { kind: result.kind };
    if (result.kind === "unreachable") console.warn("Centro de operaciones: POS no disponible", result.detail);
  }

  const byStatus = (s: string) => automationGroups.find((g) => g.status === s)?._count._all ?? 0;
  return {
    now: pos.kind === "ok" ? Date.parse(pos.serverTime) : Date.now(),
    pos,
    reymenToday: { gross: summary.today.gross, count: summary.today.count },
    lowStock,
    automations: {
      active: byStatus("ACTIVE"),
      paused: byStatus("PAUSED"),
      error: byStatus("ERROR"),
      failed24h,
      recentFailures: recentFailures.map((f) => ({ id: f.id, automation: f.automation.name, message: f.errorMessage, at: f.createdAt })),
    },
    posRejected24h,
    delivery: { active: deliveryActive.length, late: deliveryActive.filter((o) => isDeliveryLate(o, new Date())).length },
  };
}
