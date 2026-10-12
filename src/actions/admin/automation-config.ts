"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { configFields, currentConfigValues, resolveConfigSource, validateConfigUpdate, type ConfigFieldError } from "@/lib/automation/config-form";
import type { ConfigFieldView } from "@/lib/automation/config-ui";

// ─── Configuración de parámetros por cliente (blueprints y plantillas n8n) ──────────────────────────────────────
// Una sola pantalla y un solo validador: los parámetros de un blueprint salen de su código y los de una plantilla n8n
// de la declaración de su versión (`configSpec`); ambos se guardan en `Automation.config`.

export type AutomationConfigForm = {
  automationId: string;
  name: string;
  version: string;
  kind: "blueprint" | "template";
  fields: ConfigFieldView[];
  /** Valores actuales (los guardados sobre los de fábrica). */
  values: Record<string, string | number | null>;
  /** Zona horaria del negocio: de ella dependen las horas (silencio, envío del reporte). */
  timezone: string;
  /** Con envío real, los cambios aplican de inmediato. */
  live: boolean;
};

const idSchema = z.object({ orgId: z.string(), automationId: z.string() });

async function ownedAutomation(orgId: string, automationId: string) {
  const automation = await prisma.automation.findFirst({ where: { id: automationId, organizationId: orgId } });
  if (!automation) throw new UserError("Automatización no encontrada");
  return automation;
}

/** Parámetros de una automatización para un cliente: campos generados desde su declaración, con los valores actuales. */
export async function getAutomationConfigForm(data: z.infer<typeof idSchema>): Promise<AutomationConfigForm> {
  await requireAdmin();
  const { orgId, automationId } = idSchema.parse(data);
  const automation = await ownedAutomation(orgId, automationId);
  const [source, org] = await Promise.all([resolveConfigSource(automation), prisma.organization.findUnique({ where: { id: orgId }, select: { timezone: true } })]);
  if (!source) throw new UserError("Esta automatización no tiene parámetros configurables");
  if (!org) throw new UserError("Cliente no encontrado");
  return {
    automationId,
    name: source.name,
    version: source.version,
    kind: source.kind,
    fields: configFields(source),
    values: currentConfigValues(source, automation.config),
    timezone: org.timezone,
    // En un blueprint, "en vivo" = envío real; una plantilla n8n corre en n8n y no usa el dry-run del motor.
    live: automation.status === "ACTIVE" && (source.kind === "template" || !automation.dryRun),
  };
}

export type SaveAutomationConfigResult = { success: true; changed: string[] } | { success: false; errors: Record<string, ConfigFieldError> };

/**
 * Guarda los parámetros de una automatización para un cliente. Valida con su esquema (límites incluidos) y con su
 * coherencia entre parámetros; rechaza llaves desconocidas; deja en la bitácora qué cambió (antes y después).
 */
export async function saveAutomationConfig(data: z.infer<typeof idSchema> & { config: Record<string, unknown> }): Promise<SaveAutomationConfigResult> {
  const session = await requireAdmin();
  const { orgId, automationId } = idSchema.parse(data);
  const automation = await ownedAutomation(orgId, automationId);
  const source = await resolveConfigSource(automation);
  if (!source) throw new UserError("Esta automatización no tiene parámetros configurables");

  const update = validateConfigUpdate(source, automation.config, data.config);
  if (!update.ok) return { success: false, errors: update.errors };
  if (update.changed.length > 0) {
    await prisma.automation.update({ where: { id: automation.id }, data: { config: update.after as object } });
    await logAudit({
      userId: session.user.id,
      organizationId: orgId,
      action: "automation.config",
      resource: "Automation",
      resourceId: automation.id,
      metadata: { kind: source.kind, key: automation.blueprintKey, changes: Object.fromEntries(update.changed.map((k) => [k, { from: update.before[k] ?? null, to: update.after[k] ?? null }])) },
    });
  }
  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true, changed: update.changed };
}
