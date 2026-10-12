import { prisma } from "@/lib/prisma";
import type { AutomationExecutionStatus } from "@prisma/client";
import { verifyCallbackToken } from "./dispatcher";

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
  const ex = await prisma.automationExecution.findUnique({ where: { id: input.executionId } });
  if (!ex) return { ok: false, reason: "not_found" };
  // Solo una ejecución que ya salió hacia n8n (o que n8n confirma antes de que se marque) puede cerrarse.
  if (ex.status !== "DISPATCHED" && ex.status !== "PENDING") return { ok: true, changed: false, status: ex.status };

  const status = TARGET[input.status];
  await prisma.automationExecution.update({
    where: { id: ex.id },
    data: {
      status,
      providerMessageId: input.providerMessageId ?? ex.providerMessageId,
      lastError: status === "FAILED" || status === "SKIPPED" ? (input.error ?? null)?.slice(0, 500) ?? null : null,
      skipReason: status === "SKIPPED" ? "provider_skipped" : ex.skipReason,
      completedAt: now,
      nextAttemptAt: null,
    },
  });
  await prisma.automation.update({ where: { id: ex.automationId }, data: { lastRunAt: now, lastStatus: status } });
  return { ok: true, changed: true, status };
}
