"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CustomFieldType, type UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";
import { MAX_CUSTOM_FIELDS, cleanLabel, keyFromLabel, normalizeOptions, sanitizeCustomFields, uniqueKey } from "@/lib/custom-fields";
import { getActiveCustomFields } from "@/lib/custom-fields-db";

async function requireManager() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "settings:manage")) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");
  return session;
}

const createSchema = z.object({
  label: z.string(),
  type: z.nativeEnum(CustomFieldType),
  options: z.union([z.string(), z.array(z.string())]).optional(),
});

export async function createCustomField(data: z.infer<typeof createSchema>) {
  const session = await requireManager();
  const orgId = session.user.organizationId!;
  const parsed = createSchema.parse(data);

  const label = cleanLabel(parsed.label);
  if (!label) throw new UserError("Escribe el nombre del campo");
  const options = parsed.type === "SELECT" ? normalizeOptions(parsed.options) : [];
  if (parsed.type === "SELECT" && options.length === 0) throw new UserError("Agrega al menos una opción a la lista");

  const existing = await prisma.customField.findMany({ where: { organizationId: orgId }, select: { key: true, label: true, order: true, isActive: true } });
  if (existing.length >= MAX_CUSTOM_FIELDS) throw new UserError(`Alcanzaste el máximo de ${MAX_CUSTOM_FIELDS} campos personalizados`);
  if (existing.some((f) => f.isActive && f.label.toLowerCase() === label.toLowerCase())) throw new UserError("Ya tienes un campo con ese nombre");

  const key = uniqueKey(keyFromLabel(label), new Set(existing.map((f) => f.key)));
  const field = await prisma.customField.create({
    data: { organizationId: orgId, key, label, type: parsed.type, options, order: Math.max(-1, ...existing.map((f) => f.order)) + 1 },
  });

  await logAudit({ organizationId: orgId, userId: session.user.id, action: "custom_field.create", resource: "CustomField", resourceId: field.id, metadata: { label, type: parsed.type } });
  revalidatePath("/portal/settings");
  revalidatePath("/portal/leads");
  return { success: true, fieldId: field.id, key: field.key };
}

const updateSchema = z.object({
  fieldId: z.string(),
  label: z.string().optional(),
  options: z.union([z.string(), z.array(z.string())]).optional(),
});

/** Cambia el nombre o las opciones de un campo. El tipo y la clave no cambian (los datos ya guardados dependen de ellos). */
export async function updateCustomField(data: z.infer<typeof updateSchema>) {
  const session = await requireManager();
  const orgId = session.user.organizationId!;
  const parsed = updateSchema.parse(data);

  const field = await prisma.customField.findFirst({ where: { id: parsed.fieldId, organizationId: orgId } });
  if (!field) throw new UserError("Campo no encontrado");

  const patch: { label?: string; options?: string[] } = {};
  if (parsed.label !== undefined) {
    const label = cleanLabel(parsed.label);
    if (!label) throw new UserError("Escribe el nombre del campo");
    const clash = await prisma.customField.findFirst({ where: { organizationId: orgId, isActive: true, id: { not: field.id }, label: { equals: label, mode: "insensitive" } } });
    if (clash) throw new UserError("Ya tienes un campo con ese nombre");
    patch.label = label;
  }
  if (parsed.options !== undefined) {
    if (field.type !== "SELECT") throw new UserError("Solo las listas tienen opciones");
    const options = normalizeOptions(parsed.options);
    if (options.length === 0) throw new UserError("Agrega al menos una opción a la lista");
    patch.options = options;
  }
  if (Object.keys(patch).length === 0) return { success: true };

  await prisma.customField.update({ where: { id: field.id }, data: patch });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: "custom_field.update", resource: "CustomField", resourceId: field.id, metadata: patch });
  revalidatePath("/portal/settings");
  revalidatePath("/portal/leads");
  return { success: true };
}

/** Archiva o reactiva un campo. Archivar lo oculta pero conserva los datos ya capturados. */
export async function setCustomFieldActive(fieldId: string, isActive: boolean) {
  const session = await requireManager();
  const orgId = session.user.organizationId!;
  const field = await prisma.customField.findFirst({ where: { id: fieldId, organizationId: orgId } });
  if (!field) throw new UserError("Campo no encontrado");
  if (isActive && (await prisma.customField.count({ where: { organizationId: orgId, isActive: true, id: { not: field.id }, label: { equals: field.label, mode: "insensitive" } } })) > 0) {
    throw new UserError("Ya tienes un campo con ese nombre");
  }

  await prisma.customField.update({ where: { id: field.id }, data: { isActive } });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: isActive ? "custom_field.restore" : "custom_field.archive", resource: "CustomField", resourceId: field.id, metadata: { label: field.label } });
  revalidatePath("/portal/settings");
  revalidatePath("/portal/leads");
  return { success: true };
}

/**
 * Guarda los valores de los campos personalizados de un contacto. Todo o nada:
 * si algún valor no corresponde al tipo del campo no se guarda nada y se dice cuál.
 */
export async function updateLeadCustomFields(leadId: string, values: Record<string, unknown>) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  // "leads:create" (quien puede dar de alta y modificar contactos): el rol de solo lectura no la tiene.
  if (!can(session.user.role as UserRole, "leads:create")) throw new UserError("No autorizado");
  const orgId = session.user.organizationId;
  await assertModuleEnabled(orgId, "CRM");

  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: orgId, deletedAt: null } });
  if (!lead) throw new UserError("Lead no encontrado");

  const fields = await getActiveCustomFields(orgId);
  const result = sanitizeCustomFields(fields, values, lead.customFields);
  if (result.invalid.length > 0) {
    const label = fields.find((f) => f.key === result.invalid[0])?.label ?? result.invalid[0];
    throw new UserError(`El valor de «${label}» no es válido`);
  }

  await prisma.lead.update({ where: { id: leadId }, data: { customFields: result.values } });
  await logAudit({
    organizationId: orgId,
    userId: session.user.id,
    action: "lead.custom_fields_update",
    resource: "Lead",
    resourceId: leadId,
    metadata: { keys: Object.keys(values).filter((k) => fields.some((f) => f.key === k)) },
  });

  revalidatePath(`/portal/leads/${leadId}`);
  return { success: true };
}
