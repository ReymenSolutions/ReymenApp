import { prisma } from "@/lib/prisma";
import type { Blueprint } from "./types";

export type TemplateOverlap = { templateName: string; category: string };

/**
 * Plantillas de n8n ACTIVAS de la organización que hacen un trabajo parecido al del blueprint (misma categoría).
 * Activar las dos puede mandar el mismo mensaje dos veces al mismo cliente: se avisa antes de pasar a envío real.
 */
export async function findTemplateOverlaps(organizationId: string, blueprint: Pick<Blueprint, "overlapCategories">): Promise<TemplateOverlap[]> {
  const categories = blueprint.overlapCategories ?? [];
  if (categories.length === 0) return [];
  const installations = await prisma.templateInstallation.findMany({
    where: { organizationId, status: "ACTIVE", template: { category: { in: categories } } },
    select: { template: { select: { name: true, category: true } } },
  });
  return installations.map((i) => ({ templateName: i.template.name, category: i.template.category }));
}
