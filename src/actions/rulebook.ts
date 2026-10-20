"use server";

import { revalidatePath } from "next/cache";
import { requireAiManager } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { sanitizeRulebook, type RulebookInput } from "@/lib/rulebook";

/** Guarda el rulebook del negocio de la sesión (una fila por organización). Requiere gestionar la base de conocimiento. */
export async function saveRulebook(input: RulebookInput) {
  const session = await requireAiManager();
  const organizationId = session.user.organizationId;
  const data = sanitizeRulebook(input);

  const row = await prisma.businessRulebook.upsert({
    where: { organizationId },
    create: { organizationId, ...data, updatedById: session.user.id },
    update: { ...data, updatedById: session.user.id },
  });
  await logAudit({ organizationId, userId: session.user.id, action: "rulebook.update", resource: "BusinessRulebook", resourceId: row.id });

  revalidatePath("/portal/knowledge-base");
  return { success: true, savedAt: row.updatedAt };
}
