import { createHmac } from "crypto";
import { prisma } from "@/lib/prisma";
import { createWebhookSignature, secretsMatch } from "@/lib/webhook-validator";
import { getAppUrl } from "@/lib/app-url";

/** Espera antes de reintentar un envío que falló: 1, 5, 30 min, 2 h, 12 h; después queda FAILED. */
export const DISPATCH_BACKOFF_MINUTES = [1, 5, 30, 120, 720];
export const DISPATCH_MAX_ATTEMPTS = DISPATCH_BACKOFF_MINUTES.length;
const DISPATCH_TIMEOUT_MS = 5_000;
/** Tope por tick, para no alargar la transacción del reloj si n8n está lento. */
const DISPATCH_BATCH = 20;
/** Un mensaje que no salió en este lapso ya no tiene sentido enviarlo. */
const DEADLINE_HOURS = 24;

/** Workflow genérico de n8n por tipo de acción (nunca por cliente). */
const ACTION_WORKFLOW: Record<string, { path: string; type: string }> = {
  message: { path: "reymen-action-message", type: "action.message.send" },
};

function n8nConfig() {
  const secret = process.env.N8N_WEBHOOK_SECRET ?? "";
  const baseUrl = (process.env.N8N_BASE_URL ?? "").replace(/\/+$/, "");
  return { secret, baseUrl };
}

/** Token de callback de una ejecución: el workflow genérico no necesita el secreto de cada organización. */
export function callbackToken(executionId: string, secret: string = n8nConfig().secret): string {
  return createHmac("sha256", secret).update(`automation-execution:${executionId}`).digest("hex");
}

export function verifyCallbackToken(executionId: string, token: string): boolean {
  const { secret } = n8nConfig();
  if (!secret || !token) return false;
  return secretsMatch(token, callbackToken(executionId, secret));
}

export type DispatchResult = { dispatched: number; retried: number; failed: number; expired: number; skipped: boolean };

/**
 * Envía a n8n las ejecuciones PENDING (solo existen con el dry-run apagado). Con timeout de 5 s y
 * reintentos con espera creciente; n8n caído nunca bloquea ventas ni eventos: solo agenda reintentos.
 */
export async function dispatchPendingExecutions(opts: { now?: Date; limit?: number; fetchImpl?: typeof fetch; organizationId?: string } = {}): Promise<DispatchResult> {
  const now = opts.now ?? new Date();
  const result: DispatchResult = { dispatched: 0, retried: 0, failed: 0, expired: 0, skipped: false };
  const { secret, baseUrl } = n8nConfig();
  if (!secret || !baseUrl) {
    // Sin n8n configurado no se intenta nada: las ejecuciones se quedan PENDING.
    result.skipped = true;
    return result;
  }
  const doFetch = opts.fetchImpl ?? fetch;

  const pending = await prisma.automationExecution.findMany({
    where: { status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }], ...(opts.organizationId ? { organizationId: opts.organizationId } : {}) },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? DISPATCH_BATCH,
    include: {
      automation: { select: { id: true, blueprintKey: true, blueprintVersion: true, dryRun: true, status: true } },
      domainEvent: { select: { id: true, type: true, correlationId: true } },
    },
  });

  for (const ex of pending) {
    // Si entre tanto se volvió a simulación o se pausó, no se envía.
    if (ex.automation.dryRun || ex.automation.status !== "ACTIVE") continue;
    const deadline = new Date(ex.createdAt.getTime() + DEADLINE_HOURS * 3_600_000);
    if (now > deadline) {
      await prisma.automationExecution.update({ where: { id: ex.id }, data: { status: "SKIPPED", skipReason: "expired" } });
      result.expired++;
      continue;
    }
    const action = (ex.action ?? {}) as { type?: string; channel?: string; templateKey?: string; variables?: Record<string, string>; recipient?: { phone?: string; name?: string | null } };
    const workflow = action.type ? ACTION_WORKFLOW[action.type] : undefined;
    if (!workflow) {
      await prisma.automationExecution.update({ where: { id: ex.id }, data: { status: "FAILED", lastError: "unsupported_action", completedAt: now } });
      result.failed++;
      continue;
    }
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: ex.organizationId }, select: { id: true, name: true, timezone: true } });
    const attempt = ex.attempts + 1;
    const body = JSON.stringify({
      specVersion: "1.0",
      id: `${ex.id}:${attempt}`,
      type: workflow.type,
      occurredAt: now.toISOString(),
      organization: { id: org.id, timezone: org.timezone, displayName: org.name },
      automation: { id: ex.automation.id, blueprintKey: ex.automation.blueprintKey, blueprintVersion: ex.automation.blueprintVersion },
      execution: { id: ex.id, attempt, dryRun: false },
      trigger: { eventId: ex.domainEvent.id, eventType: ex.domainEvent.type, correlationId: ex.domainEvent.correlationId },
      subject: { type: ex.subjectType, id: ex.subjectId },
      recipient: { channel: action.channel, phone: action.recipient?.phone, name: action.recipient?.name ?? null, locale: "es-MX" },
      content: { templateKey: action.templateKey, variables: action.variables ?? {} },
      callback: { url: `${getAppUrl()}/api/webhooks/n8n/automation-executions`, token: callbackToken(ex.id, secret) },
      deadline: deadline.toISOString(),
    });
    const timestamp = String(now.getTime());
    let error: string | null = null;
    try {
      const res = await doFetch(`${baseUrl}/webhook/${workflow.path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Reymen-Signature": createWebhookSignature(body, secret, timestamp),
          "X-Reymen-Timestamp": timestamp,
          "X-Reymen-Event-Id": `${ex.id}:${attempt}`,
        },
        body,
        signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
      });
      if (!res.ok) error = `n8n returned ${res.status}`;
    } catch (err) {
      error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    }

    if (!error) {
      await prisma.automationExecution.update({ where: { id: ex.id }, data: { status: "DISPATCHED", attempts: attempt, dispatchedAt: now, nextAttemptAt: null, lastError: null } });
      await prisma.automation.update({ where: { id: ex.automation.id }, data: { lastRunAt: now, lastStatus: "DISPATCHED" } });
      result.dispatched++;
    } else if (attempt >= DISPATCH_MAX_ATTEMPTS) {
      await prisma.automationExecution.update({ where: { id: ex.id }, data: { status: "FAILED", attempts: attempt, lastError: error, completedAt: now, nextAttemptAt: null } });
      await prisma.automation.update({ where: { id: ex.automation.id }, data: { lastRunAt: now, lastStatus: "FAILED" } });
      result.failed++;
    } else {
      const wait = DISPATCH_BACKOFF_MINUTES[attempt - 1] * 60_000;
      await prisma.automationExecution.update({ where: { id: ex.id }, data: { attempts: attempt, lastError: error, nextAttemptAt: new Date(now.getTime() + wait) } });
      result.retried++;
    }
  }
  return result;
}
