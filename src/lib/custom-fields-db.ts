import type { CustomField } from "@prisma/client";
import { prisma } from "./prisma";
import type { CustomFieldDef } from "./custom-fields";

/** Campos personalizados activos de la organización, en su orden. */
export async function getActiveCustomFields(organizationId: string): Promise<(CustomField & CustomFieldDef)[]> {
  return prisma.customField.findMany({ where: { organizationId, isActive: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
}
