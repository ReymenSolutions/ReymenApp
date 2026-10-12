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
