import { prisma } from "@/lib/prisma";
import type { AutomationExecutionStatus } from "@prisma/client";
import { verifyCallbackToken } from "./dispatcher";
import { recordTouchForExecution } from "./attribution";

export type CallbackStatus = "sent" | "delivered" | "failed" | "skipped";
export const CALLBACK_STATUSES: CallbackStatus[] = ["sent", "delivered", "failed", "skipped"];

export type CallbackInput = { executionId: string; token: string; status: CallbackStatus; providerMessageId?: string | null; error?: string | null };
export type CallbackOutcome = { ok: true; changed: boolean; status: AutomationExecutionStatus } | { ok: false; reason: "invalid_token" | "not_found" };

const TARGET: Record<CallbackStatus, AutomationExecutionStatus> = { sent: "SUCCEEDED", delivered: "SUCCEEDED", failed: "FAILED", skipped: "SKIPPED" };

/**
 * Resultado que n8n reporta de una ejecución. Se autentica con el token por ejecución (HMAC del id) y
 * es idempotente: una ejecución ya terminada no cambia, así que un callback repetido no hace nada.
 */
export async function applyExecutionCallback(input: CallbackInput, now: Date = new Date()): Promise<CallbackOutcome> {
  if (!verifyCallbackToken(input.executionId, input.token)) return { ok: false, reason: "invalid_token" };
  const outcome = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`automation-callback:${input.executionId}`}))`;
    const ex = await tx.automationExecution.findUnique({ where: { id: input.executionId } });
    if (!ex) return { ok: false, reason: "not_found" } as const;
    const executionKey = `blueprint:${ex.id}`;
    const usage = await tx.automationUsage.findUnique({ where: { organizationId_executionKey: { organizationId: ex.organizationId, executionKey } } });
    // A dispatcher timeout can exhaust retries before the provider confirms success.
    const uncertain = ex.status === "FAILED" && usage?.state === "RESERVED";
    if (ex.status !== "DISPATCHED" && ex.status !== "PENDING" && !uncertain) return { ok: true, changed: false, status: ex.status } as const;
    const status = TARGET[input.status];
    await tx.automationExecution.update({
      where: { id: ex.id },
      data: {
        status, providerMessageId: input.providerMessageId ?? ex.providerMessageId,
        lastError: status === "FAILED" || status === "SKIPPED" ? (input.error ?? null)?.slice(0, 500) ?? null : null,
        skipReason: status === "SKIPPED" ? "provider_skipped" : ex.skipReason,
        completedAt: now, nextAttemptAt: null,
      },
    });
    await tx.automationUsage.updateMany({ where: { organizationId: ex.organizationId, executionKey, state: "RESERVED" }, data: { state: status === "SUCCEEDED" ? "SUCCEEDED" : "RELEASED" } });
    await tx.automation.update({ where: { id: ex.automationId }, data: { lastRunAt: now, lastStatus: status } });
    return { ok: true, changed: true, status } as const;
  });
  if (outcome.ok && outcome.status === "SUCCEEDED") await recordTouchForExecution(input.executionId, now);
  return outcome;
}
