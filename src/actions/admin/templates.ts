"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { applyTemplateInstall } from "@/lib/template-install";
import type { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { validateConfigSpec } from "@/lib/automation/config-spec";

const templateSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(10),
  longDescription: z.string().optional(),
  industry: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()).optional(),
  iconEmoji: z.string().optional(),
});

const versionSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Usa formato semver: 1.0.0"),
  changelog: z.string().optional(),
  n8nWorkflowJson: z.record(z.string(), z.unknown()),
  /** Parámetros configurables por cliente (formato de src/lib/automation/config-spec.ts). */
  configSpec: z.record(z.string(), z.unknown()).optional(),
});

export async function createTemplate(data: z.infer<typeof templateSchema>) {
  const session = await requireAdmin();

  const parsed = templateSchema.parse(data);

  const template = await prisma.automationTemplate.create({
    data: {
      ...parsed,
      tags: parsed.tags ?? [],
      iconEmoji: parsed.iconEmoji ?? "⚡",
      createdBy: session.user.id,
    },
  });

  revalidatePath("/admin/templates");
  return { success: true, templateId: template.id };
}

export async function publishTemplate(templateId: string, isPublished: boolean) {
  await requireAdmin();

  const template = await prisma.automationTemplate.findUnique({
    where: { id: templateId },
    include: { versions: { where: { isLatest: true } } },
  });
  if (!template) throw new UserError("Template no encontrado");
  if (isPublished && template.versions.length === 0) {
    throw new UserError("No puedes publicar un template sin versiones");
  }

  await prisma.automationTemplate.update({
    where: { id: templateId },
    data: { isPublished },
  });

  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

export async function addTemplateVersion(
  templateId: string,
  data: z.infer<typeof versionSchema>
) {
  await requireAdmin();

  const parsed = versionSchema.parse(data);
  if (parsed.configSpec) {
    const spec = validateConfigSpec(parsed.configSpec);
    if (!spec.ok) throw new UserError(`Parámetros del template no válidos: ${spec.errors.join("; ")}`);
  }

  const template = await prisma.automationTemplate.findUnique({
    where: { id: templateId },
  });
  if (!template) throw new UserError("Template no encontrado");

  // Check version doesn't exist
  const existing = await prisma.templateVersion.findUnique({
    where: { templateId_version: { templateId, version: parsed.version } },
  });
  if (existing) throw new UserError(`La versión ${parsed.version} ya existe`);

  await prisma.$transaction([
    // Mark all existing versions as not latest
    prisma.templateVersion.updateMany({
      where: { templateId },
      data: { isLatest: false },
    }),
    // Create new version
    prisma.templateVersion.create({
      data: {
        templateId,
        version: parsed.version,
        changelog: parsed.changelog,
        n8nWorkflowJson: parsed.n8nWorkflowJson as Prisma.InputJsonValue,
        configSpec: parsed.configSpec ? (parsed.configSpec as Prisma.InputJsonValue) : undefined,
        isLatest: true,
      },
    }),
    // Update template's currentVersion
    prisma.automationTemplate.update({
      where: { id: templateId },
      data: { currentVersion: parsed.version },
    }),
  ]);

  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true };
}

/**
 * Admin equivalent of installTemplate() (src/actions/templates.ts), for
 * installing a template on a client's behalf. Two real differences from
 * the client self-service path: an admin can pin any version, not just
 * the latest, and this isn't subject to the org's own plan capacity (a
 * deliberate admin override, not an oversight). Both still funnel into
 * the same applyTemplateInstall() for the actual Automation/
 * TemplateInstallation/audit-log work.
 */
export async function installTemplateForClient(
  orgId: string,
  templateId: string,
  versionId: string,
  config?: Record<string, unknown>
) {
  const session = await requireAdmin();

  const [org, version] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.templateVersion.findUnique({
      where: { id: versionId },
      include: { template: true },
    }),
  ]);
  if (!org) throw new UserError("Cliente no encontrado");
  if (!version) throw new UserError("Versión no encontrada");

  const { automationId } = await applyTemplateInstall({
    orgId,
    userId: session.user.id,
    templateId,
    template: {
      name: version.template.name,
      description: version.template.description,
      category: version.template.category,
    },
    version: { id: version.id, version: version.version, n8nWorkflowId: version.n8nWorkflowId, configSpec: version.configSpec },
    config,
  });

  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath(`/admin/templates/${templateId}`);
  return { success: true, automationId };
}
