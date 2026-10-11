import { prisma } from "@/lib/prisma";
import { runAutomationsForEvent } from "@/lib/automation/engine";
import { processDomainEvents, purgeProcessedDomainEvents, type OutboxResult } from "@/lib/domain-events";

// Llave del candado del reloj de automatizaciones (cualquier entero fijo; solo debe ser única en la base).
const TICK_LOCK_KEY = 7_204_001;

export type TickResult = { ran: true; outbox: OutboxResult; purged: number } | { ran: false; reason: "locked" };

/**
 * Un "tick" del reloj (lo llama el cron del VPS cada 5 min): procesa la bandeja de eventos y limpia los
 * viejos. Un candado de Postgres (advisory lock de transacción) evita que dos ticks corran a la vez; si
 * otro tick sigue trabajando, este responde `locked` y no hace nada.
 */
export async function runAutomationTick(now: Date = new Date(), opts: { organizationId?: string } = {}): Promise<TickResult> {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${TICK_LOCK_KEY}) AS locked`;
      if (!locked) return { ran: false as const, reason: "locked" as const };
      const outbox = await processDomainEvents({ now, organizationId: opts.organizationId, consumers: [(event) => runAutomationsForEvent(event, now)] });
      const purged = await purgeProcessedDomainEvents(now);
      return { ran: true as const, outbox, purged };
    },
    { timeout: 120_000, maxWait: 5_000 },
  );
}
