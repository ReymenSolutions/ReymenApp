"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateWebhookSecret } from "@/lib/utils";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";

const automationSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(2, "Mínimo 2 caracteres"),
  type: z.string().min(1),
  description: z.string().optional(),
  n8nWorkflowId: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(2).optional(),
  type: z.string().min(1).optional(),
  description: z.string().optional(),
  n8nWorkflowId: z.string().optional(),
  status: z.enum(["ACTIVE", "PAUSED", "ERROR", "ARCHIVED"]).optional(),
});


export async function createAutomation(data: {
  organizationId: string;
  name: string;
  type: string;
  description?: string;
  n8nWorkflowId?: string;
}) {
  await requireAdmin();
  const parsed = automationSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Datos inválidos: " + parsed.error.issues[0].message);

  const automation = await prisma.automation.create({
    data: {
      organizationId: parsed.data.organizationId,
      name: parsed.data.name,
      type: parsed.data.type,
      description: parsed.data.description ?? null,
      n8nWorkflowId: parsed.data.n8nWorkflowId || null,
      webhookSecret: generateWebhookSecret(),
    },
  });

  revalidatePath("/admin/automations");
  return { success: true, id: automation.id };
}

export async function updateAutomation(
  id: string,
  data: { name?: string; type?: string; description?: string; n8nWorkflowId?: string; status?: string }
) {
  await requireAdmin();
  const parsed = updateSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Datos inválidos");

  await prisma.automation.update({
    where: { id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.type ? { type: parsed.data.type } : {}),
      description: parsed.data.description ?? undefined,
      n8nWorkflowId: "n8nWorkflowId" in data ? (parsed.data.n8nWorkflowId || null) : undefined,
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    },
  });

  revalidatePath("/admin/automations");
  return { success: true };
}

export async function toggleAutomationStatus(id: string) {
  await requireAdmin();
  const automation = await prisma.automation.findUniqueOrThrow({ where: { id } });
  const newStatus = automation.status === "ACTIVE" ? "PAUSED" : "ACTIVE";

  await prisma.automation.update({ where: { id }, data: { status: newStatus } });
  revalidatePath("/admin/automations");
  return { success: true, status: newStatus };
}

export async function rotateWebhookSecret(id: string) {
  await requireAdmin();
  const newSecret = generateWebhookSecret();
  await prisma.automation.update({ where: { id }, data: { webhookSecret: newSecret } });
  revalidatePath("/admin/automations");
  return { success: true, secret: newSecret };
}

export async function archiveAutomation(id: string) {
  await requireAdmin();
  await prisma.automation.update({ where: { id }, data: { status: "ARCHIVED" } });
  revalidatePath("/admin/automations");
  return { success: true };
}
