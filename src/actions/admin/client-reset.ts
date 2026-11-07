"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { previewClientReset, resetClientData, resetConfirmationMatches, type ClientResetSummary } from "@/lib/client-reset";

const schema = z.object({ orgId: z.string().min(1) });

/** Vista previa: cuántos datos de operación se borrarían (no borra nada). */
export async function previewClientResetAction(data: z.infer<typeof schema>): Promise<ClientResetSummary> {
  await requireAdmin();
  const { orgId } = schema.parse(data);
  return previewClientReset(orgId);
}

/**
 * «Dejar como nuevo»: borra los datos de operación del cliente y conserva menú, usuarios y configuración.
 * Solo administradores de la plataforma; hay que escribir el nombre exacto del negocio y queda en la bitácora.
 */
export async function resetClientDataAction(data: z.infer<typeof schema> & { confirm: string }): Promise<ClientResetSummary> {
  const session = await requireAdmin();
  const { orgId } = schema.parse(data);
  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } });
  if (!org) throw new UserError("Cliente no encontrado");
  if (!resetConfirmationMatches(org.name, String(data.confirm ?? ""))) throw new UserError("Escribe el nombre exacto del negocio para confirmar");
  const result = await resetClientData(orgId);
  await logAudit({ userId: session.user.id, organizationId: orgId, action: "client.data_reset", resource: "Organization", resourceId: orgId, metadata: { ...result } });
  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/portal", "layout");
  return result;
}
