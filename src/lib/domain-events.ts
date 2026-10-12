import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Tx = Prisma.TransactionClient;

export type DomainEventInput = {
  organizationId: string;
  type: string;
  subjectType: string;
  subjectId: string;
  occurredAt: Date;
  payload?: Prisma.InputJsonValue;
  /** Único por organización: el mismo hecho emitido dos veces deja un solo evento. */
  dedupeKey: string;
  correlationId?: string | null;
  causationId?: string | null;
};

/** Eventos que emite hoy el sistema (el motor de automatizaciones se suscribe a estos). */
export const DOMAIN_EVENT_TYPES = ["sale.completed", "sale.cancelled", "customer.created", "inventory.level_changed", "report.daily_due"] as const;
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

/**
 * Escribe el evento en la bandeja DENTRO de la transacción del hecho: si la venta se revierte, el
 * evento también; si el mismo hecho llega otra vez (reintento del POS), no se duplica. Es un INSERT,
 * nunca bloquea ni llama a servicios externos.
 */
export async function emitDomainEvent(tx: Tx, input: DomainEventInput): Promise<void> {
  await tx.domainEvent.upsert({
    where: { organizationId_dedupeKey: { organizationId: input.organizationId, dedupeKey: input.dedupeKey } },
    create: {
      organizationId: input.organizationId,
      type: input.type,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      occurredAt: input.occurredAt,
      payload: input.payload ?? {},
      dedupeKey: input.dedupeKey,
      correlationId: input.correlationId ?? null,
      causationId: input.causationId ?? null,
    },
    update: {},
  });
}

export type StoredDomainEvent = Awaited<ReturnType<typeof prisma.domainEvent.findFirstOrThrow>>;
export type DomainEventConsumer = (event: StoredDomainEvent) => Promise<void>;

const consumers: DomainEventConsumer[] = [];

/** El motor de automatizaciones (y cualquier otro consumidor) se registra aquí; se llama una vez por evento. */
export function registerDomainEventConsumer(consumer: DomainEventConsumer): () => void {
  consumers.push(consumer);
  return () => {
    const i = consumers.indexOf(consumer);
    if (i >= 0) consumers.splice(i, 1);
  };
}

/** Espera antes de reintentar un evento que falló: 1, 5, 30 min, 2 h, 12 h; después queda FAILED. */
export const RETRY_BACKOFF_MINUTES = [1, 5, 30, 120, 720];
export const MAX_ATTEMPTS = RETRY_BACKOFF_MINUTES.length;

export type OutboxResult = { processed: number; failed: number; retried: number };

/**
 * Procesa los eventos pendientes que ya les toca (los más viejos primero). Un consumidor que lanza error
 * deja el evento para reintento con backoff; no frena a los demás eventos.
 */
export async function processDomainEvents(opts: { now?: Date; limit?: number; consumers?: DomainEventConsumer[]; organizationId?: string } = {}): Promise<OutboxResult> {
  const now = opts.now ?? new Date();
  const list = opts.consumers ?? consumers;
  const events = await prisma.domainEvent.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now }, ...(opts.organizationId ? { organizationId: opts.organizationId } : {}) },
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
    take: opts.limit ?? 200,
  });
  const result: OutboxResult = { processed: 0, failed: 0, retried: 0 };
  for (const event of events) {
    try {
      for (const consumer of list) await consumer(event);
      await prisma.domainEvent.update({ where: { id: event.id }, data: { status: "PROCESSED", processedAt: now, attempts: { increment: 1 }, error: null } });
      result.processed++;
    } catch (err) {
      const attempts = event.attempts + 1;
      const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
      if (attempts >= MAX_ATTEMPTS) {
        await prisma.domainEvent.update({ where: { id: event.id }, data: { status: "FAILED", attempts, error: message } });
        result.failed++;
      } else {
        const wait = RETRY_BACKOFF_MINUTES[attempts - 1] * 60_000;
        await prisma.domainEvent.update({ where: { id: event.id }, data: { attempts, error: message, nextAttemptAt: new Date(now.getTime() + wait) } });
        result.retried++;
      }
    }
  }
  return result;
}

export const PURGE_AFTER_DAYS = 90;

/** La bandeja no crece sin fin: los eventos ya procesados se borran a los 90 días. */
export async function purgeProcessedDomainEvents(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 86_400_000);
  const { count } = await prisma.domainEvent.deleteMany({ where: { status: "PROCESSED", processedAt: { lt: cutoff } } });
  return count;
}
