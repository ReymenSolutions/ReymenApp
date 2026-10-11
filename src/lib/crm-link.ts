import { prisma } from "./prisma";
import { phoneKey } from "./phone";

/** El lead vivo más antiguo de la organización con ese teléfono (por llave), o null. */
export async function findLeadByPhone(organizationId: string, phone: string | null | undefined) {
  const key = phoneKey(phone);
  if (!key) return null;
  return prisma.lead.findFirst({
    where: { organizationId, phoneKey: key, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Cuando aparece un lead nuevo, enlaza las conversaciones que ya existían con
 * ese teléfono y aún no tenían contacto (p. ej. alguien que escribió antes de
 * que lo dieran de alta a mano).
 */
export async function linkOrphanConversations(organizationId: string, leadId: string, phone: string | null | undefined) {
  const key = phoneKey(phone);
  if (!key) return 0;
  const res = await prisma.conversation.updateMany({
    where: { organizationId, phoneKey: key, leadId: null },
    data: { leadId },
  });
  return res.count;
}
