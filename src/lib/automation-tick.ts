import { prisma } from "@/lib/prisma";
import { dispatchPendingExecutions, type DispatchResult } from "@/lib/automation/dispatcher";
import { runAutomationsForEvent } from "@/lib/automation/engine";
import { attributeEvent } from "@/lib/automation/attribution";
import { runClockDetectors } from "@/lib/automation/detectors";
import { processDomainEvents, purgeProcessedDomainEvents, type OutboxResult } from "@/lib/domain-events";

// Llave del candado del reloj de automatizaciones (cualquier entero fijo; solo debe ser única en la base).
const TICK_LOCK_KEY = 7_204_001;

export type TickResult = { ran: true; outbox: OutboxResult; dispatch: DispatchResult; purged: number } | { ran: false; reason: "locked" };

/**
 * Un "tick" del reloj (lo llama el cron del VPS cada 5 min): procesa la bandeja de eventos, envía a n8n las
 * ejecuciones pendientes y limpia los viejos. Un candado de Postgres (advisory lock de transacción) evita que dos ticks corran a la vez; si
 * otro tick sigue trabajando, este responde `locked` y no hace nada.
 */
export async function runAutomationTick(now: Date = new Date(), opts: { organizationId?: string } = {}): Promise<TickResult> {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${TICK_LOCK_KEY}) AS locked`;
      if (!locked) return { ran: false as const, reason: "locked" as const };
      // Lo que lo dispara la hora (no un hecho) se convierte en eventos antes de procesar la bandeja.
      await runClockDetectors(now, { organizationId: opts.organizationId });
      const outbox = await processDomainEvents({ now, organizationId: opts.organizationId, consumers: [(event) => runAutomationsForEvent(event, now), attributeEvent] });
      const dispatch = await dispatchPendingExecutions({ now, organizationId: opts.organizationId });
      const purged = await purgeProcessedDomainEvents(now);
      return { ran: true as const, outbox, dispatch, purged };
    },
    { timeout: 120_000, maxWait: 5_000 },
  );
}
