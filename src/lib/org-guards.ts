import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";

// Validar el tenant del objeto principal no basta: toda relación que llega del cliente (propietario, lead, etc.) debe
// pertenecer también a la organización de la sesión. Estas funciones son el único lugar donde se comprueba.

/** El usuario existe, está activo y es de esta organización. */
export async function assertOrgUser(organizationId: string, userId: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, organizationId, isActive: true }, select: { id: true } });
  if (!user) throw new UserError("Usuario no encontrado");
  return user;
}

/** El lead existe, no está archivado y es de esta organización. */
export async function assertOrgLead(organizationId: string, leadId: string) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId, deletedAt: null }, select: { id: true } });
  if (!lead) throw new UserError("Lead no encontrado");
  return lead;
}

/** La organización existe y no está suspendida. Toda entrada automática (webhooks, API keys) debe cerrarse con esto. */
export async function isOrgActive(organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { isActive: true } });
  return !!org?.isActive;
}
