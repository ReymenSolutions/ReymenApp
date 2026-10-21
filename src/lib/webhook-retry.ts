import { prisma } from "./prisma";
import { processWebhookEventPayload } from "./webhook-processors";
import { AUTO_JOB_SOURCE } from "./ai-auto-jobs";

export const MAX_WEBHOOK_ATTEMPTS = 5;

export class WebhookRetryError extends Error {}

/** Un evento PROCESSING con más de esto sin avanzar es de un proceso que murió (reinicio, corte): se puede recuperar. */
export const STALE_PROCESSING_MS = 10 * 60 * 1000;

/** Filtro de los eventos que un reintento puede tomar: fallidos, o "en proceso" abandonados. */
function retryableWhere(now: Date) {
  const cutoff = new Date(now.getTime() - STALE_PROCESSING_MS);
  return {
    source: { not: AUTO_JOB_SOURCE },
    attempts: { lt: MAX_WEBHOOK_ATTEMPTS },
    OR: [
      { status: "FAILED" as const },
      { status: "PROCESSING" as const, OR: [{ claimedAt: { lt: cutoff } }, { claimedAt: null, createdAt: { lt: cutoff } }] },
    ],
  };
}

/**
 * Re-runs a previously FAILED (or abandoned PROCESSING) WebhookEvent's processing logic in place.
 * The event is claimed with a single conditional UPDATE, so two concurrent retries (the cron and an admin click, or two
 * cron instances) can never both run it: the loser gets a WebhookRetryError instead of a duplicate side effect.
 * Refuses an event already PROCESSED or past MAX_WEBHOOK_ATTEMPTS.
 */
export async function retryWebhookEvent(eventId: string, now: Date = new Date()): Promise<{ success: boolean }> {
  const event = await prisma.webhookEvent.findUniqueOrThrow({ where: { id: eventId } });

  if (event.source === AUTO_JOB_SOURCE) throw new WebhookRetryError("La recuperación interna de IA se procesa desde el cron");
  if (event.status === "PROCESSED") {
    throw new WebhookRetryError("Este evento ya fue procesado exitosamente");
  }
  if (event.attempts >= MAX_WEBHOOK_ATTEMPTS) {
    throw new WebhookRetryError(`Se alcanzó el máximo de ${MAX_WEBHOOK_ATTEMPTS} intentos`);
  }

  const claimed = await prisma.webhookEvent.updateMany({
    where: { id: eventId, ...retryableWhere(now) },
    data: { status: "PROCESSING", attempts: { increment: 1 }, claimedAt: now },
  });
  if (claimed.count === 0) throw new WebhookRetryError("Este evento se está procesando en este momento");

  try {
    await processWebhookEventPayload(event.eventType, event.payload, event.organizationId);

    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: { status: "PROCESSED", processedAt: new Date(), errorMessage: null },
    });

    return { success: true };
  } catch (error) {
    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    return { success: false };
  }
}

/**
 * Retries every FAILED event (and every abandoned PROCESSING one) still under the attempt cap, oldest first.
 * Used by the admin "retry all" action and the scheduled retry cron — both
 * call this with no `organizationId`, sweeping every organization's backlog
 * together (intentional: this is a platform-wide reliability sweep, not a
 * per-tenant one). `organizationId` exists so a narrower sweep is possible
 * (e.g. clearing one org's backlog specifically) without a second code path.
 */
export async function retryAllFailedWebhookEvents(
  options: { limit?: number; organizationId?: string; now?: Date } = {}
): Promise<{ retried: number; succeeded: number }> {
  const { limit = 50, organizationId, now = new Date() } = options;
  const events = await prisma.webhookEvent.findMany({
    where: {
      ...retryableWhere(now),
      ...(organizationId ? { organizationId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let retried = 0;
  let succeeded = 0;
  for (const event of events) {
    try {
      const result = await retryWebhookEvent(event.id, now);
      retried++;
      if (result.success) succeeded++;
    } catch (err) {
      // Otro proceso lo tomó primero (o ya se procesó): no es un fallo del barrido.
      if (!(err instanceof WebhookRetryError)) throw err;
    }
  }

  return { retried, succeeded };
}
