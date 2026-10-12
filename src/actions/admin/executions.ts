"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AutomationExecutionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { getBlueprint } from "@/lib/automation/blueprints";
import { nextAllowedTime } from "@/lib/automation/policy";
import { UserError } from "@/lib/user-error";
import { EXECUTIONS_PAGE_SIZE, retryEligibility } from "@/lib/automation/retry";

// ─── Ejecuciones, errores y conversiones por cliente (Admin) ─────────────────

const STATUSES: AutomationExecutionStatus[] = ["SKIPPED", "PENDING", "DISPATCHED", "SUCCEEDED", "FAILED", "DRY_RUN"];

const filtersSchema = z.object({
  orgId: z.string(),
  automationId: z.string().optional(),
  status: z.enum(STATUSES as [AutomationExecutionStatus, ...AutomationExecutionStatus[]]).optional(),
  days: z.number().int().min(1).max(365).default(30),
  page: z.number().int().min(1).default(1),
});
export type ExecutionFilters = z.input<typeof filtersSchema>;

export type ExecutionRow = {
  id: string;
  createdAt: Date;
  automationId: string;
  automationName: string;
  status: AutomationExecutionStatus;
  skipReason: string | null;
  lastError: string | null;
  attempts: number;
  nextAttemptAt: Date | null;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  providerMessageId: string | null;
  action: unknown;
  /** Cliente / insumo / reporte sobre el que actuó, en texto. */
  subjectLabel: string;
  event: { id: string; type: string; occurredAt: Date; correlationId: string | null };
  /** Contacto y conversión asociados (atribución), si los hay. */
  touchedAt: Date | null;
  conversion: { saleId: string; revenue: number; reverted: boolean; saleAt: Date } | null;
  /** ¿Se puede reintentar de forma segura? (y por qué no, si no) */
  retry: { allowed: true } | { allowed: false; reason: string };
};

export type ExecutionsView = {
  rows: ExecutionRow[];
  total: number;
  page: number;
  pageSize: number;
  automations: { id: string; name: string }[];
  summary: {
    byStatus: Partial<Record<AutomationExecutionStatus, number>>;
    touches: number;
    conversions: number;
    revenue: number;
    failed: number;
  };
};

export async function getOrganizationExecutions(input: ExecutionFilters): Promise<ExecutionsView> {
  await requireAdmin();
  const f = filtersSchema.parse(input);
  const since = new Date(Date.now() - f.days * 86_400_000);
  const where: Prisma.AutomationExecutionWhereInput = {
    organizationId: f.orgId,
    createdAt: { gte: since },
    automation: { blueprintKey: { not: null } },
    ...(f.automationId ? { automationId: f.automationId } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
  const base: Prisma.AutomationExecutionWhereInput = { organizationId: f.orgId, createdAt: { gte: since }, automation: { blueprintKey: { not: null } }, ...(f.automationId ? { automationId: f.automationId } : {}) };

  const [total, list, automations, byStatus, touches, conversions] = await Promise.all([
    prisma.automationExecution.count({ where }),
    prisma.automationExecution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (f.page - 1) * EXECUTIONS_PAGE_SIZE,
      take: EXECUTIONS_PAGE_SIZE,
      include: { automation: { select: { name: true, status: true, dryRun: true } }, domainEvent: { select: { id: true, type: true, occurredAt: true, correlationId: true } } },
    }),
    prisma.automation.findMany({ where: { organizationId: f.orgId, blueprintKey: { not: null } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.automationExecution.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    prisma.automationTouch.count({ where: { organizationId: f.orgId, touchedAt: { gte: since }, ...(f.automationId ? { automationId: f.automationId } : {}) } }),
    prisma.automationConversion.findMany({ where: { organizationId: f.orgId, saleAt: { gte: since }, ...(f.automationId ? { automationId: f.automationId } : {}) }, select: { executionId: true, saleId: true, saleAt: true, attributedRevenue: true, revertedAt: true } }),
  ]);

  const customerIds = [...new Set(list.filter((e) => e.subjectType === "customer").map((e) => e.subjectId))];
  const itemIds = [...new Set(list.filter((e) => e.subjectType === "inventory_item").map((e) => e.subjectId))];
  const executionIds = list.map((e) => e.id);
  const [customers, items, rowTouches, rowConversions] = await Promise.all([
    customerIds.length ? prisma.customer.findMany({ where: { id: { in: customerIds }, organizationId: f.orgId }, select: { id: true, name: true, phone: true, consentAccepted: true } }) : [],
    itemIds.length ? prisma.foodInventoryItem.findMany({ where: { id: { in: itemIds }, organizationId: f.orgId }, select: { id: true, name: true } }) : [],
    executionIds.length ? prisma.automationTouch.findMany({ where: { organizationId: f.orgId, executionId: { in: executionIds } }, select: { executionId: true, touchedAt: true } }) : [],
    executionIds.length ? prisma.automationConversion.findMany({ where: { organizationId: f.orgId, executionId: { in: executionIds } }, select: { executionId: true, saleId: true, saleAt: true, attributedRevenue: true, revertedAt: true } }) : [],
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const itemById = new Map(items.map((i) => [i.id, i.name]));

  const rows: ExecutionRow[] = list.map((e) => {
    const customer = e.subjectType === "customer" ? customerById.get(e.subjectId) ?? null : null;
    const subjectLabel = e.subjectType === "customer" ? (customer ? `${customer.name ?? "Cliente sin nombre"} · ${customer.phone}` : "Cliente eliminado") : e.subjectType === "inventory_item" ? itemById.get(e.subjectId) ?? "Insumo" : e.subjectType === "report" ? `Reporte ${e.subjectId}` : e.subjectType === "feedback" ? "Opinión de un cliente" : e.subjectId;
    const conv = rowConversions.find((c) => c.executionId === e.id);
    return {
      id: e.id,
      createdAt: e.createdAt,
      automationId: e.automationId,
      automationName: e.automation.name,
      status: e.status,
      skipReason: e.skipReason,
      lastError: e.lastError,
      attempts: e.attempts,
      nextAttemptAt: e.nextAttemptAt,
      dispatchedAt: e.dispatchedAt,
      completedAt: e.completedAt,
      providerMessageId: e.providerMessageId,
      action: e.action,
      subjectLabel,
      event: { id: e.domainEvent.id, type: e.domainEvent.type, occurredAt: e.domainEvent.occurredAt, correlationId: e.domainEvent.correlationId },
      touchedAt: rowTouches.find((t) => t.executionId === e.id)?.touchedAt ?? null,
      conversion: conv ? { saleId: conv.saleId, revenue: Number(conv.attributedRevenue), reverted: !!conv.revertedAt, saleAt: conv.saleAt } : null,
      retry: retryEligibility(e, e.automation, customer),
    };
  });

  const active = conversions.filter((c) => !c.revertedAt);
  return {
    rows,
    total,
    page: f.page,
    pageSize: EXECUTIONS_PAGE_SIZE,
    automations,
    summary: {
      byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])),
      touches,
      conversions: active.length,
      revenue: active.reduce((sum, c) => sum + Number(c.attributedRevenue), 0),
      failed: byStatus.find((b) => b.status === "FAILED")?._count._all ?? 0,
    },
  };
}

const retrySchema = z.object({ orgId: z.string(), executionId: z.string() });

/**
 * Reintento manual de una ejecución FALLIDA, solo cuando es seguro (ver `retryEligibility`): vuelve a la cola con
 * plazo nuevo, respetando las horas de silencio. No cambia la decisión: solo reintenta el envío. Queda en la bitácora.
 */
export async function retryExecution(data: z.infer<typeof retrySchema>, now: Date = new Date()) {
  const session = await requireAdmin();
  const { orgId, executionId } = retrySchema.parse(data);
  const ex = await prisma.automationExecution.findFirst({ where: { id: executionId, organizationId: orgId }, include: { automation: true } });
  if (!ex) throw new UserError("Ejecución no encontrada");
  const customer = ex.subjectType === "customer" ? await prisma.customer.findFirst({ where: { id: ex.subjectId, organizationId: orgId }, select: { consentAccepted: true } }) : null;
  const check = retryEligibility(ex, ex.automation, customer);
  if (!check.allowed) throw new UserError(check.reason);

  // Las horas de silencio del blueprint también aplican al reintento.
  const blueprint = ex.automation.blueprintKey ? getBlueprint(ex.automation.blueprintKey, ex.automation.blueprintVersion) : null;
  const config = blueprint?.configSchema.safeParse(ex.automation.config ?? {});
  const quiet = blueprint && config?.success ? blueprint.contactRules(config.data).quietHours : null;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { timezone: true } });
  const sendAt = nextAllowedTime(now, org.timezone, quiet);

  // Se actualiza solo si SIGUE fallida (dos clics a la vez no la ponen en cola dos veces).
  const { count } = await prisma.automationExecution.updateMany({
    where: { id: ex.id, organizationId: orgId, status: "FAILED" },
    data: { status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: sendAt, completedAt: null, action: { ...(ex.action as object), sendAfter: sendAt.toISOString() } },
  });
  if (count === 0) throw new UserError("Solo se reintentan las fallidas");
  await logAudit({ userId: session.user.id, organizationId: orgId, action: "automation.execution_retry", resource: "AutomationExecution", resourceId: ex.id, metadata: { automationId: ex.automationId, previousError: ex.lastError?.slice(0, 200) ?? null } });
  revalidatePath(`/admin/clients/${orgId}/automations`);
  return { success: true, scheduledAt: sendAt };
}
