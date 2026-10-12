"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { sanitizeRulebook, type RulebookInput } from "@/lib/rulebook";
import { UserError } from "@/lib/user-error";
import type { UserRole } from "@prisma/client";

/** Guarda el rulebook del negocio de la sesión (una fila por organización). Requiere gestionar la base de conocimiento. */
export async function saveRulebook(input: RulebookInput) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "knowledge_base:manage")) throw new UserError("No autorizado");
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
