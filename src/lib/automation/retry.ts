import type { AutomationExecutionStatus } from "@prisma/client";

// Reglas de las ejecuciones en el Admin. Viven aquí (y no en la acción de servidor) porque un archivo "use server"
// solo puede exportar funciones asíncronas.

export const EXECUTIONS_PAGE_SIZE = 25;

/** ¿Una ejecución fallida se puede volver a mandar sin riesgo de duplicar? */
export function retryEligibility(ex: { status: AutomationExecutionStatus; providerMessageId: string | null; action: unknown }, automation: { status: string; dryRun: boolean }, customer: { consentAccepted: boolean } | null): { allowed: true } | { allowed: false; reason: string } {
  if (ex.status !== "FAILED") return { allowed: false, reason: "Solo se reintentan las fallidas" };
  if ((ex.action as { type?: string } | null)?.type !== "message") return { allowed: false, reason: "Esta acción no se reintenta" };
  if (ex.providerMessageId) return { allowed: false, reason: "El proveedor ya tiene un id de mensaje: reintentar podría duplicarlo" };
  if (automation.status !== "ACTIVE") return { allowed: false, reason: "La automatización está pausada" };
  if (automation.dryRun) return { allowed: false, reason: "La automatización está en simulación" };
  if (!customer) return { allowed: false, reason: "El cliente ya no existe" };
  if (!customer.consentAccepted) return { allowed: false, reason: "El cliente ya no tiene consentimiento" };
  return { allowed: true };
}

