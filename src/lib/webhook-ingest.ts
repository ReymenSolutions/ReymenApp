import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

interface IngestParams {
  organizationId: string;
  source: string;
  eventType: string;
  payload: unknown;
  /** Caller-supplied idempotency key for this exact delivery (e.g. n8n's own execution/event ID). Null when the source doesn't provide one — that delivery is always processed, matching pre-idempotency behavior. */
  externalEventId: string | null;
  /** Firma de la entrega: la misma entrega firmada reenviada (aunque cambie el header de id) se descarta como duplicado. */
  replayKey?: string | null;
}

export type IngestResult<T> =
  | { outcome: "duplicate" }
  | { outcome: "processed"; result: T }
  | { outcome: "failed"; error: string };

/**
 * Records an inbound webhook delivery and runs `process` against it exactly
 * once per (organizationId, source, externalEventId) — a resent delivery
 * short-circuits as a duplicate instead of reprocessing and creating a
 * second WebhookEvent row. Two concurrent deliveries of the same event both
 * pass the existence check, but the DB's unique constraint on that same
 * triple catches the race at insert time (see the P2002 handling below),
 * so this is safe under real concurrency, not just sequential retries.
 */
export async function ingestWebhookEvent<T>(
  params: IngestParams,
  process: () => Promise<T>
): Promise<IngestResult<T>> {
  const { organizationId, source, eventType, payload, externalEventId } = params;
  const replayKey = params.replayKey || null;

  if (externalEventId) {
    const existing = await prisma.webhookEvent.findUnique({
      where: { organizationId_source_externalEventId: { organizationId, source, externalEventId } },
    });
    if (existing) return { outcome: "duplicate" };
  }
  if (replayKey) {
    const replay = await prisma.webhookEvent.findUnique({ where: { organizationId_source_replayKey: { organizationId, source, replayKey } }, select: { id: true } });
    if (replay) return { outcome: "duplicate" };
  }

  let webhookEvent: { id: string };
  try {
    webhookEvent = await prisma.webhookEvent.create({
      data: {
        organizationId,
        source,
        eventType,
        payload: payload as Prisma.InputJsonValue,
        status: "PROCESSING",
        attempts: 1,
        externalEventId,
        replayKey,
        claimedAt: new Date(),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { outcome: "duplicate" };
    }
    throw err;
  }

  try {
    const result = await process();
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "PROCESSED", processedAt: new Date() },
    });
    return { outcome: "processed", result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.webhookEvent.update({
      where: { id: webhookEvent.id },
      data: { status: "FAILED", errorMessage: message },
    });
    return { outcome: "failed", error: message };
  }
}
