import { prisma } from "@/lib/prisma";

export interface RateLimitOptions {
  /** Max attempts allowed inside the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Present only when allowed is false. */
  retryAfterSeconds?: number;
}

/** Ninguna ventana del sistema pasa de un día: lo más viejo se barre de toda la tabla (no solo de la llave consultada). */
const GLOBAL_RETENTION_MS = 24 * 60 * 60 * 1000;
const GLOBAL_SWEEP_PROBABILITY = 0.01;

/**
 * DB-backed sliding-window rate limiter — holds up across multiple
 * serverless instances/processes without needing Redis, at the cost of
 * a short transaction to Postgres per check. Fine for auth and webhook
 * endpoints, which are already far from hot paths.
 *
 * La admisión es atómica por llave: contar y registrar el golpe ocurren bajo un candado de Postgres
 * (`pg_advisory_xact_lock` sobre la llave), así que N peticiones simultáneas no pueden colarse todas por debajo
 * del límite. Callers should call this BEFORE doing the sensitive work.
 */
export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const windowStart = new Date(Date.now() - opts.windowMs);

  // Best-effort cleanup so the table doesn't grow unbounded; failures here
  // must never block the actual rate-limit decision.
  prisma.rateLimitHit.deleteMany({ where: { key, createdAt: { lt: windowStart } } }).catch(() => {});
  // Llaves que ya no se consultan (IPs, correos que no vuelven) nunca se limpiaban por llave: barrido global ocasional.
  if (Math.random() < GLOBAL_SWEEP_PROBABILITY) {
    prisma.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - GLOBAL_RETENTION_MS) } } }).catch(() => {});
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"ratelimit:" + key}))`;

    const recentHits = await tx.rateLimitHit.findMany({
      where: { key, createdAt: { gte: windowStart } },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });

    if (recentHits.length >= opts.limit) {
      const oldest = recentHits[0].createdAt;
      const retryAfterMs = oldest.getTime() + opts.windowMs - Date.now();
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
    }

    await tx.rateLimitHit.create({ data: { key } });
    return { allowed: true };
  });
}
