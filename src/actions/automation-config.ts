"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { requireModule } from "@/lib/modules";
import { UserError } from "@/lib/user-error";
import { currentConfigValues, ownerEditableFields, resolveConfigSource, validateConfigUpdate } from "@/lib/automation/config-form";
import type { AutomationConfigForm, SaveAutomationConfigResult } from "@/actions/admin/automation-config";
import type { UserRole } from "@prisma/client";

// ─── El dueño ajusta, desde su portal, solo los parámetros que el equipo marcó como editables (`ownerEditable`) ──────
// Es un subconjunto seguro (p. ej. horario de silencio, enlace de reseñas). Cuándo actúa, a quién escribe, los límites y,
// sobre todo, pasar de simulación a envío real siguen siendo del admin: aquí no se toca ni el estado ni el envío real.

async function ownerAutomation(automationId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "settings:manage")) throw new UserError("No autorizado");
  const organizationId = session.user.organizationId;
  await requireModule(organizationId, "AUTOMATIONS");
  const automation = await prisma.automation.findFirst({ where: { id: automationId, organizationId } });
  if (!automation) throw new UserError("Automatización no encontrada");
  return { session, organizationId, automation };
}

/** Cuántos parámetros puede editar el dueño en cada automatización de su negocio (para mostrar u ocultar «Ajustar»). */
export async function listOwnerEditableCounts(): Promise<Record<string, number>> {
  const session = await auth();
  if (!session?.user.organizationId || !can(session.user.role as UserRole, "settings:manage")) return {};
  const automations = await prisma.automation.findMany({ where: { organizationId: session.user.organizationId }, select: { id: true, name: true, blueprintKey: true, blueprintVersion: true } });
  const out: Record<string, number> = {};
  for (const a of automations) {
    const source = await resolveConfigSource(a);
    const count = source ? ownerEditableFields(source).length : 0;
    if (count > 0) out[a.id] = count;
  }
  return out;
}

export async function getOwnerConfigForm(automationId: string): Promise<AutomationConfigForm> {
  const { organizationId, automation } = await ownerAutomation(z.string().min(1).parse(automationId));
  const [source, org] = await Promise.all([resolveConfigSource(automation), prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } })]);
  const fields = source ? ownerEditableFields(source) : [];
  if (!source || fields.length === 0 || !org) throw new UserError("Esta automatización no tiene parámetros que puedas ajustar");
  const values = currentConfigValues(source, automation.config);
  return {
    automationId,
    name: source.name,
    version: source.version,
    kind: source.kind,
    fields,
    values: Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? null])),
    timezone: org.timezone,
    live: automation.status === "ACTIVE" && (source.kind === "template" || !automation.dryRun),
  };
}

export async function saveOwnerConfig(data: { automationId: string; config: Record<string, unknown> }): Promise<SaveAutomationConfigResult> {
  const { session, organizationId, automation } = await ownerAutomation(z.string().min(1).parse(data.automationId));
  const source = await resolveConfigSource(automation);
  const editable = source ? new Set(ownerEditableFields(source).map((f) => f.key)) : new Set<string>();
  if (!source || editable.size === 0) throw new UserError("Esta automatización no tiene parámetros que puedas ajustar");

  // Intentar cambiar un parámetro que no es del dueño es un error, no algo que se ignora en silencio.
  const stored = currentConfigValues(source, automation.config);
  const forbidden = Object.keys(data.config ?? {}).filter((k) => !editable.has(k) && k in stored && JSON.stringify(data.config[k] ?? null) !== JSON.stringify(stored[k] ?? null));
  if (forbidden.length > 0) throw new UserError("No tienes permiso para cambiar ese parámetro");

  const update = validateConfigUpdate(source, automation.config, data.config, editable);
  if (!update.ok) return { success: false, errors: update.errors };
  if (update.changed.length > 0) {
    await prisma.automation.update({ where: { id: automation.id }, data: { config: update.after as object } });
    await logAudit({
      userId: session.user.id,
      organizationId,
      action: "automation.config",
      resource: "Automation",
      resourceId: automation.id,
      metadata: { by: "owner", kind: source.kind, key: automation.blueprintKey, changes: Object.fromEntries(update.changed.map((k) => [k, { from: update.before[k] ?? null, to: update.after[k] ?? null }])) },
    });
  }
  revalidatePath("/portal/automations");
  revalidatePath(`/admin/clients/${organizationId}`);
  return { success: true, changed: update.changed };
}
