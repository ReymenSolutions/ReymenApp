import type { Automation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { triggerN8nWorkflow } from "@/lib/n8n";
import { currentConfigValues, resolveConfigSource } from "./config-form";

// ── Cómo llega la configuración de un cliente a n8n ──────────────────────────────────────────────────────────────
// Un workflow genérico de n8n no lleva horarios, plantillas, teléfonos ni enlaces dentro: sirve a TODOS los clientes y
// recibe la configuración del cliente correcto desde Reymen, que es la dueña del dato (`Automation.config`). Hay dos vías,
// con el mismo contenido (`AutomationEnvelope`):
//  1. Por evento: cuando Reymen le avisa a n8n de algo para una automatización, el cuerpo firmado trae `automation`.
//  2. Por consulta: en flujos que empiezan en un canal (p. ej. un WhatsApp entrante) n8n pregunta al endpoint firmado
//     `POST /api/webhooks/n8n/automation-config` por la configuración de esa automatización.

export type AutomationEnvelope = {
  organizationId: string;
  automationId: string;
  status: Automation["status"];
  /** De qué plantilla viene (null si es un blueprint o una automatización sin plantilla). */
  template: { id: string; version: string } | null;
  /** Valores vigentes: lo guardado sobre los de fábrica (o lo guardado tal cual en una plantilla sin parámetros declarados). */
  configuration: Record<string, unknown>;
  /** Parámetros obligatorios que aún no tienen valor: n8n debe tratar la automatización como incompleta. */
  missingRequired: string[];
};

/** El contenido que recibe n8n para una automatización (sin secretos: nunca incluye `webhookSecret`). */
export async function buildAutomationEnvelope(automation: Automation): Promise<AutomationEnvelope> {
  const source = await resolveConfigSource(automation);
  const configuration = source ? (currentConfigValues(source, automation.config) as Record<string, unknown>) : ((automation.config ?? {}) as Record<string, unknown>);
  const missingRequired = source?.spec ? Object.entries(source.spec).filter(([key, f]) => f.required && (configuration[key] === undefined || configuration[key] === null || configuration[key] === "")).map(([key]) => key) : [];
  let template: AutomationEnvelope["template"] = null;
  if (!automation.blueprintKey) {
    const installation = await prisma.templateInstallation.findFirst({ where: { automationId: automation.id, status: "ACTIVE" }, select: { templateId: true, version: { select: { version: true } } } });
    if (installation) template = { id: installation.templateId, version: installation.version.version };
  }
  return { organizationId: automation.organizationId, automationId: automation.id, status: automation.status, template, configuration, missingRequired };
}

/**
 * La automatización ACTIVA que pide n8n, solo si es de esa organización: por id, o por plantilla instalada. Cualquier otro caso
 * (no existe, es de otro cliente, está pausada) devuelve null y el endpoint responde igual, para no revelar qué ids existen.
 */
export async function findAutomationForDelivery(input: { organizationId: string; automationId?: string; templateId?: string }): Promise<Automation | null> {
  if (input.automationId) return prisma.automation.findFirst({ where: { id: input.automationId, organizationId: input.organizationId, status: "ACTIVE" } });
  if (input.templateId) {
    const installation = await prisma.templateInstallation.findFirst({ where: { organizationId: input.organizationId, templateId: input.templateId, status: "ACTIVE", automationId: { not: null } }, select: { automationId: true } });
    return installation?.automationId ? prisma.automation.findFirst({ where: { id: installation.automationId, organizationId: input.organizationId, status: "ACTIVE" } }) : null;
  }
  return null;
}

/** Avisa a n8n de un evento para una automatización, con su configuración dentro del cuerpo firmado. */
export async function triggerAutomationWorkflow(automationId: string, webhookPath: string, event: string, data: Record<string, unknown> = {}): Promise<{ success: boolean; error?: string }> {
  const automation = await prisma.automation.findFirst({ where: { id: automationId, status: "ACTIVE" } });
  if (!automation) return { success: false, error: "Automation not active" };
  const envelope = await buildAutomationEnvelope(automation);
  return triggerN8nWorkflow(webhookPath, { organizationId: automation.organizationId, event, data, automation: envelope });
}
