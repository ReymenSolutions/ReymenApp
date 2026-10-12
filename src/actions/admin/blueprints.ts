"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { AutomationExecutionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { requireAdmin } from "@/lib/guards";
import { hasModule, getModuleLabel } from "@/lib/modules";
import { getBlueprint, listBlueprints } from "@/lib/automation/blueprints";
import { findTemplateOverlaps, type TemplateOverlap } from "@/lib/automation/overlap";
import { describeConfig, type ConfigFieldView } from "@/lib/automation/config-ui";
import { UserError } from "@/lib/user-error";

export type BlueprintRow = {
  key: string;
  name: string;
  description: string;
  version: number;
  trigger: string;
  requiredModules: string[];
  /** Plantillas n8n activas del cliente que hacen un trabajo parecido (riesgo de mensajes duplicados). */
  overlaps: TemplateOverlap[];
  /** null = aún no se habilita para esta organización. */
  instance: { id: string; status: string; dryRun: boolean; lastRunAt: string | null; lastStatus: AutomationExecutionStatus | null; counts: Partial<Record<AutomationExecutionStatus, number>> } | null;
};

/** Catálogo de blueprints con el estado de cada uno en esta organización. */
export async function getOrganizationBlueprints(orgId: string): Promise<BlueprintRow[]> {
  await requireAdmin();
  const instances = await prisma.automation.findMany({ where: { organizationId: orgId, blueprintKey: { not: null } } });
  const counts = await prisma.automationExecution.groupBy({ by: ["automationId", "status"], where: { organizationId: orgId }, _count: { _all: true } });
  const overlaps = await Promise.all(listBlueprints().map((b) => findTemplateOverlaps(orgId, b)));
  return listBlueprints().map((b, idx) => {
    const inst = instances.find((i) => i.blueprintKey === b.key);
    return {
      key: b.key,
      name: b.name,
      description: b.description,
      version: b.version,
      trigger: b.trigger,
      requiredModules: b.requiredModules.map((m) => getModuleLabel("es")[m]),
      overlaps: overlaps[idx],
      instance: inst
        ? {
            id: inst.id,
            status: inst.status,
            dryRun: inst.dryRun,
            lastRunAt: inst.lastRunAt?.toISOString() ?? null,
            lastStatus: inst.lastStatus,
            counts: Object.fromEntries(counts.filter((c) => c.automationId === inst.id).map((c) => [c.status, c._count._all])),
          }
        : null,
    };
  });
}

const enableSchema = z.object({ orgId: z.string(), key: z.string() });

/** Habilita un blueprint para una organización. Siempre nace en dry-run: no contacta a nadie hasta que un admin lo apague. */
export async function enableBlueprint(data: z.infer<typeof enableSchema>) {
  const session = await requireAdmin();
  const { orgId, key } = enableSchema.parse(data);
  const blueprint = getBlueprint(key);
  if (!blueprint) throw new UserError("Automatización no encontrada");
  for (const required of blueprint.requiredModules) {
    if (!(await hasModule(orgId, required))) throw new UserError("Activa primero los módulos que necesita esta automatización");
  }
  const existing = await prisma.automation.findUnique({ where: { organizationId_blueprintKey: { organizationId: orgId, blueprintKey: key } } });
  const automation = existing
    ? await prisma.automation.update({ where: { id: existing.id }, data: { status: "ACTIVE" } })
    : await prisma.automation.create({
        data: {
          organizationId: orgId,
          name: blueprint.name,
          description: blueprint.description,
          type: "blueprint",
          status: "ACTIVE",
          webhookSecret: randomBytes(24).toString("hex"),
          blueprintKey: key,
          blueprintVersion: blueprint.version,
          trigger: blueprint.trigger,
          config: blueprint.defaultConfig as object,
          dryRun: true,
        },
      });
  await logAudit({ userId: session.user.id, organizationId: orgId, action: "automation.blueprint_enable", resource: "Automation", resourceId: automation.id, metadata: { key } });
  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true };
}

const toggleSchema = z.object({ orgId: z.string(), automationId: z.string() });

async function ownedBlueprintInstance(orgId: string, automationId: string) {
  const automation = await prisma.automation.findFirst({ where: { id: automationId, organizationId: orgId, blueprintKey: { not: null } } });
  if (!automation) throw new UserError("Automatización no encontrada");
  return automation;
}

/** Apaga o prende el dry-run. Apagarlo hace que las ejecuciones queden PENDING para enviarse de verdad. */
export async function setBlueprintDryRun(data: z.infer<typeof toggleSchema> & { dryRun: boolean; acknowledgeOverlap?: boolean }) {
  const session = await requireAdmin();
  const { orgId, automationId } = toggleSchema.parse(data);
  const automation = await ownedBlueprintInstance(orgId, automationId);
  // Pasar a envío real con una plantilla n8n parecida activa puede duplicar mensajes: exige confirmarlo.
  if (!data.dryRun) {
    const blueprint = automation.blueprintKey ? getBlueprint(automation.blueprintKey, automation.blueprintVersion) : null;
    const overlaps = blueprint ? await findTemplateOverlaps(orgId, blueprint) : [];
    if (overlaps.length > 0 && !data.acknowledgeOverlap) throw new UserError("Este cliente ya tiene una plantilla de n8n parecida activa; confirma que no se duplicarán los mensajes");
  }
  await prisma.automation.update({ where: { id: automation.id }, data: { dryRun: !!data.dryRun } });
  await logAudit({ userId: session.user.id, organizationId: orgId, action: "automation.blueprint_dry_run", resource: "Automation", resourceId: automation.id, metadata: { dryRun: !!data.dryRun } });
  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true };
}

/** Pausa un blueprint (deja de reaccionar a eventos; el historial se conserva). */
export async function disableBlueprint(data: z.infer<typeof toggleSchema>) {
  const session = await requireAdmin();
  const { orgId, automationId } = toggleSchema.parse(data);
  const automation = await ownedBlueprintInstance(orgId, automationId);
  await prisma.automation.update({ where: { id: automation.id }, data: { status: "PAUSED" } });
  await logAudit({ userId: session.user.id, organizationId: orgId, action: "automation.blueprint_disable", resource: "Automation", resourceId: automation.id });
  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true };
}

// ─── Configuración de parámetros por cliente ─────────────────────────────────

export type BlueprintConfigForm = {
  key: string;
  name: string;
  version: number;
  fields: ConfigFieldView[];
  /** Valores actuales (los guardados sobre los de fábrica). */
  values: Record<string, string | number | null>;
  /** Zona horaria del negocio: de ella dependen las horas (silencio, envío del reporte). */
  timezone: string;
  /** Con envío real, los cambios aplican de inmediato a los clientes. */
  live: boolean;
  enabled: boolean;
};

const keySchema = z.object({ orgId: z.string(), key: z.string() });

/** Parámetros de un blueprint para un cliente: campos generados desde su esquema, con los valores actuales. */
export async function getBlueprintConfigForm(data: z.infer<typeof keySchema>): Promise<BlueprintConfigForm> {
  await requireAdmin();
  const { orgId, key } = keySchema.parse(data);
  const blueprint = getBlueprint(key);
  if (!blueprint) throw new UserError("Automatización no encontrada");
  const [instance, org] = await Promise.all([
    prisma.automation.findUnique({ where: { organizationId_blueprintKey: { organizationId: orgId, blueprintKey: key } } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { timezone: true } }),
  ]);
  if (!org) throw new UserError("Cliente no encontrado");
  const parsed = blueprint.configSchema.safeParse(instance?.config ?? {});
  const current = (parsed.success ? parsed.data : blueprint.defaultConfig) as Record<string, string | number | null>;
  return { key, name: blueprint.name, version: blueprint.version, fields: describeConfig(blueprint), values: current, timezone: org.timezone, live: !!instance && instance.status === "ACTIVE" && !instance.dryRun, enabled: !!instance };
}

export type ConfigFieldError = { code: "invalid" | "too_small" | "too_big" | "not_integer" | "must_be_less"; min?: number; max?: number; other?: string };
export type SaveBlueprintConfigResult = { success: true; changed: string[] } | { success: false; errors: Record<string, ConfigFieldError> };

/**
 * Guarda los parámetros de un blueprint para un cliente. Valida con el esquema del blueprint (límites incluidos) y con
 * su coherencia entre parámetros; rechaza llaves desconocidas; deja en la bitácora qué cambió (antes y después).
 */
export async function saveBlueprintConfig(data: z.infer<typeof keySchema> & { config: Record<string, unknown> }): Promise<SaveBlueprintConfigResult> {
  const session = await requireAdmin();
  const { orgId, key } = keySchema.parse(data);
  const blueprint = getBlueprint(key);
  if (!blueprint) throw new UserError("Automatización no encontrada");
  const instance = await prisma.automation.findUnique({ where: { organizationId_blueprintKey: { organizationId: orgId, blueprintKey: key } } });
  if (!instance) throw new UserError("Primero habilita esta automatización para el cliente");

  const known = new Set(describeConfig(blueprint).map((f) => f.key));
  const incoming = Object.fromEntries(Object.entries(data.config ?? {}).filter(([k]) => known.has(k)));
  const before = blueprint.configSchema.safeParse(instance.config ?? {});
  const beforeValues = (before.success ? before.data : blueprint.defaultConfig) as Record<string, unknown>;
  const result = blueprint.configSchema.safeParse({ ...beforeValues, ...incoming });
  if (!result.success) {
    const errors: Record<string, ConfigFieldError> = {};
    for (const issue of result.error.issues) {
      const k = String(issue.path[0] ?? "");
      if (!k || errors[k]) continue;
      errors[k] = issue.code === "too_small" ? { code: "too_small", min: Number((issue as { minimum?: number }).minimum) } : issue.code === "too_big" ? { code: "too_big", max: Number((issue as { maximum?: number }).maximum) } : issue.code === "invalid_type" && (issue as { expected?: string }).expected === "number" ? { code: "not_integer" } : { code: "invalid" };
    }
    return { success: false, errors };
  }
  const cross = blueprint.crossCheck?.(result.data);
  if (cross) return { success: false, errors: { [cross.key]: { code: cross.code, other: cross.other } } };

  const after = result.data as Record<string, unknown>;
  const changed = Object.keys(after).filter((k) => JSON.stringify(after[k] ?? null) !== JSON.stringify(beforeValues[k] ?? null));
  if (changed.length > 0) {
    await prisma.automation.update({ where: { id: instance.id }, data: { config: after as object } });
    await logAudit({
      userId: session.user.id,
      organizationId: orgId,
      action: "automation.blueprint_config",
      resource: "Automation",
      resourceId: instance.id,
      metadata: { key, changes: Object.fromEntries(changed.map((k) => [k, { from: beforeValues[k] ?? null, to: after[k] ?? null }])) },
    });
  }
  revalidatePath(`/admin/clients/${orgId}`);
  return { success: true, changed };
}
