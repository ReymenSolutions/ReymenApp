"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { notifyAdmins } from "@/lib/admin-notifications";
import { newClientRequestEmail } from "@/lib/email-templates";
import { appUrl } from "@/lib/app-url";
import { UserError } from "@/lib/user-error";
import type { UserRole } from "@prisma/client";

/**
 * El cliente pide más capacidad de IA. No compra ni cobra nada: crea una solicitud para el equipo (que decide si amplía el
 * ciclo, hace una recarga o cambia el plan). Una sola solicitud abierta a la vez.
 */
export async function requestAiCapacity(note?: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "settings:view")) throw new UserError("No autorizado");
  const organizationId = session.user.organizationId;

  const open = await prisma.request.count({ where: { organizationId, type: "ai_capacity", status: { in: ["OPEN", "IN_PROGRESS"] } } });
  if (open > 0) throw new UserError("Ya tienes una solicitud de capacidad abierta");

  const extra = (note ?? "").trim().slice(0, 500);
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  const title = "Solicitud de capacidad adicional de IA";
  const description = extra.length >= 10 ? extra : "El cliente solicita más capacidad de uso de agentes de IA para su ciclo actual.";
  const req = await prisma.request.create({ data: { organizationId, title, description, type: "ai_capacity", priority: "medium" } });
  await logAudit({ organizationId, userId: session.user.id, action: "ai.capacity_request", resource: "Request", resourceId: req.id, metadata: {} });
  await notifyAdmins(newClientRequestEmail(org?.name ?? "un cliente", title, appUrl("/admin/requests"))).catch(() => undefined);

  revalidatePath("/portal/ai-usage");
  revalidatePath("/portal/requests");
  return { success: true };
}
