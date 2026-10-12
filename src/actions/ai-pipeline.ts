"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/modules";
import { UserError } from "@/lib/user-error";
import { acceptPipelineAiAction, rejectPipelineAiAction, undoPipelineAiAction } from "@/lib/ai-pipeline";
import type { UserRole } from "@prisma/client";

async function requireManager() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "opportunities:manage")) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");
  return { organizationId: session.user.organizationId, userId: session.user.id };
}

function refresh() {
  revalidatePath("/portal/pipeline");
  revalidatePath("/portal/leads");
}

/** Deshace algo que el Agente IA hizo solo en el pipeline. */
export async function undoAiAction(actionId: string) {
  const { organizationId, userId } = await requireManager();
  await undoPipelineAiAction(organizationId, actionId, userId);
  refresh();
  return { success: true };
}

/** Acepta una sugerencia del Agente IA (cerrar la oportunidad como ganada o perdida). */
export async function acceptAiSuggestion(actionId: string) {
  const { organizationId, userId } = await requireManager();
  await acceptPipelineAiAction(organizationId, actionId, userId);
  refresh();
  return { success: true };
}

export async function rejectAiSuggestion(actionId: string) {
  const { organizationId, userId } = await requireManager();
  await rejectPipelineAiAction(organizationId, actionId, userId);
  refresh();
  return { success: true };
}
