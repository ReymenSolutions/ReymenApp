import { Prisma, type AutomationExecutionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import type { StoredDomainEvent } from "@/lib/domain-events";
import { getBlueprint } from "./blueprints";
import { evaluateContactPolicy, nextAllowedTime } from "./policy";
import { deliverInternalAction } from "./internal-delivery";
import type { ActionSpec } from "./types";

type Outcome = { status: AutomationExecutionStatus; skipReason?: string; action?: Prisma.InputJsonValue; subjectType?: string; subjectId?: string; nextAttemptAt?: Date };

/**
 * Consumidor de la bandeja de eventos: por cada evento busca las automatizaciones ACTIVAS de esa
 * organización con ese trigger y registra una ejecución por cada una (SKIPPED con su razón, DRY_RUN
 * "se habría enviado…", o PENDING para el despachador). Única por automatización + evento: un evento
 * reprocesado nunca dispara dos veces.
 */
export async function runAutomationsForEvent(event: StoredDomainEvent, now: Date = new Date()): Promise<void> {
  const automations = await prisma.automation.findMany({
    where: { organizationId: event.organizationId, status: "ACTIVE", trigger: event.type, blueprintKey: { not: null } },
  });
  if (automations.length === 0) return;

  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: event.organizationId }, select: { id: true, name: true, timezone: true } });
  const payload = (event.payload ?? {}) as { customerId?: string | null };
  const customer = payload.customerId ? await prisma.customer.findFirst({ where: { id: payload.customerId, organizationId: event.organizationId } }) : null;

  for (const automation of automations) {
    const outcome = await evaluate(automation, event, { organization, customer, now });
    const subjectType = outcome.subjectType ?? (customer ? "customer" : event.subjectType);
    const subjectId = outcome.subjectId ?? (customer ? customer.id : event.subjectId);
    try {
      await prisma.automationExecution.create({
        data: {
          organizationId: event.organizationId,
          automationId: automation.id,
          domainEventId: event.id,
          subjectType,
          subjectId,
          status: outcome.status,
          skipReason: outcome.skipReason ?? null,
          action: outcome.action,
          nextAttemptAt: outcome.nextAttemptAt ?? null,
        },
      });
    } catch (err) {
      // Ya existe la ejecución de este evento para esta automatización: se ignora (idempotencia).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
    // Acción interna real (no simulada): se entrega aquí, una sola vez (una ejecución duplicada ya salió por el `continue`).
    if (outcome.status === "SUCCEEDED" && outcome.action) await deliverInternalAction(event.organizationId, organization.name, outcome.action as unknown as ActionSpec);
    await prisma.automation.update({ where: { id: automation.id }, data: { lastRunAt: now, lastStatus: outcome.status } });
  }
}

async function evaluate(
  automation: Awaited<ReturnType<typeof prisma.automation.findMany>>[number],
  event: StoredDomainEvent,
  ctx: { organization: { id: string; name: string; timezone: string }; customer: Awaited<ReturnType<typeof prisma.customer.findFirst>>; now: Date },
): Promise<Outcome> {
  const blueprint = automation.blueprintKey ? getBlueprint(automation.blueprintKey, automation.blueprintVersion) : null;
  if (!blueprint) return { status: "SKIPPED", skipReason: "blueprint_unavailable" };
  for (const required of blueprint.requiredModules) {
    if (!(await hasModule(event.organizationId, required))) return { status: "SKIPPED", skipReason: "module_disabled" };
  }
  const parsed = blueprint.configSchema.safeParse(automation.config ?? {});
  if (!parsed.success) return { status: "SKIPPED", skipReason: "invalid_config" };
  const config = parsed.data;

  const decision = blueprint.decide(event, ctx, config);
  if (decision.kind === "skip") return { status: "SKIPPED", skipReason: decision.reason };

  // Aviso interno para el equipo: no hay cliente ni política de contacto. Con dry-run solo se registra lo que se habría
  // avisado; sin dry-run el aviso queda como hecho (SUCCEEDED) y la campana del portal lo muestra.
  if (blueprint.audience === "internal") {
    return { status: automation.dryRun ? "DRY_RUN" : "SUCCEEDED", action: decision.action as unknown as Prisma.InputJsonValue };
  }

  const rules = blueprint.contactRules(config);
  const last = ctx.customer
    ? await prisma.automationExecution.findFirst({
        where: { automationId: automation.id, subjectId: ctx.customer.id, status: { in: ["PENDING", "DISPATCHED", "SUCCEEDED", "DRY_RUN"] } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      })
    : null;
  // Con retraso (p. ej. "2 h después de la compra") las horas de silencio se aplican al momento del ENVÍO, no al de procesar.
  const delayed = rules.delayMinutes !== undefined;
  const policy = evaluateContactPolicy({ customer: ctx.customer, rules: delayed ? { ...rules, quietHours: null } : rules, now: ctx.now, timezone: ctx.organization.timezone, lastContactAt: last?.createdAt ?? null });
  if (!policy.ok) return { status: "SKIPPED", skipReason: policy.reason };

  const recipient = { phone: ctx.customer!.phone, name: ctx.customer!.name };
  const prepared = blueprint.prepare ? await blueprint.prepare({ organizationId: event.organizationId, event, customer: ctx.customer!, action: decision.action, config, dryRun: automation.dryRun }) : decision.action;
  const action: Record<string, unknown> = { ...prepared, channel: rules.channel, recipient };
  let nextAttemptAt: Date | undefined;
  if (delayed) {
    const target = new Date(Math.max(event.occurredAt.getTime() + rules.delayMinutes! * 60_000, ctx.now.getTime()));
    nextAttemptAt = nextAllowedTime(target, ctx.organization.timezone, rules.quietHours);
    action.sendAfter = nextAttemptAt.toISOString();
  }
  return { status: automation.dryRun ? "DRY_RUN" : "PENDING", action: action as Prisma.InputJsonValue, nextAttemptAt };
}
