import { prisma } from "./prisma";
import { generateWebhookSecret } from "./utils";
import { logAudit } from "./audit";
import type { Prisma } from "@prisma/client";
import { UserError } from "./user-error";
import { compileConfigSpec, validateConfigSpec } from "./automation/config-spec";

interface ApplyTemplateInstallParams {
  orgId: string;
  userId: string;
  templateId: string;
  template: { name: string; description: string; category: string };
  version: { id: string; version: string; n8nWorkflowId: string | null; configSpec?: Prisma.JsonValue | null };
  config?: Record<string, unknown>;
}

/**
 * The actual per-template install, once a template + version have already
 * been resolved by the caller — installTemplateCore() (src/actions/
 * templates.ts) always picks the latest published version for a client's
 * own self-service install; installTemplateForClient() (src/actions/admin/
 * templates.ts) lets an admin pin a specific version for a client. Both
 * used to reimplement this block independently; now it's the one place
 * that creates the Automation, upserts the TemplateInstallation, and logs
 * the audit event, so every install path produces the exact same result.
 */
export async function applyTemplateInstall({
  orgId,
  userId,
  templateId,
  template,
  version,
  config,
}: ApplyTemplateInstallParams): Promise<{ automationId: string }> {
  const existing = await prisma.templateInstallation.findUnique({
    where: { organizationId_templateId: { organizationId: orgId, templateId } },
  });
  if (existing?.status === "ACTIVE") {
    throw new UserError("Este template ya está instalado");
  }

  // La configuración vive solo en Automation.config. Si la versión declara sus parámetros, se completa con los de fábrica
  // y se valida con el mismo esquema que usará la pantalla de configuración del Admin.
  let finalConfig: Record<string, unknown> | undefined = config;
  if (version.configSpec) {
    const spec = validateConfigSpec(version.configSpec);
    if (spec.ok) {
      const parsed = compileConfigSpec(spec.spec).configSchema.safeParse(config ?? {});
      if (!parsed.success) throw new UserError("Los parámetros del template no son válidos");
      finalConfig = parsed.data as Record<string, unknown>;
    }
  }

  const automation = await prisma.automation.create({
    data: {
      organizationId: orgId,
      name: template.name,
      description: template.description,
      type: template.category,
      webhookSecret: generateWebhookSecret(),
      n8nWorkflowId: version.n8nWorkflowId,
      config: finalConfig ? (finalConfig as Prisma.InputJsonValue) : undefined,
    },
  });

  if (existing) {
    await prisma.templateInstallation.update({
      where: { id: existing.id },
      data: {
        versionId: version.id,
        automationId: automation.id,
        status: "ACTIVE",
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.templateInstallation.create({
      data: {
        organizationId: orgId,
        templateId,
        versionId: version.id,
        automationId: automation.id,
        status: "ACTIVE",
      },
    });
  }

  await logAudit({
    organizationId: orgId,
    userId,
    action: "template.install",
    resource: "TemplateInstallation",
    resourceId: templateId,
    metadata: { templateName: template.name, version: version.version },
  });

  return { automationId: automation.id };
}
