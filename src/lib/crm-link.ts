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

/**
 * Clientes del POS (compras) que ya existían con el teléfono de este contacto y aún no tienen contacto:
 * se enlazan a él. Es el sentido contrario del enlace que se hace al vender; juntos, da igual qué llegue primero.
 */
export async function linkOrphanCustomers(organizationId: string, leadId: string, phone: string | null | undefined) {
  const key = phoneKey(phone);
  if (!key) return 0;
  const res = await prisma.customer.updateMany({ where: { organizationId, phoneKey: key, leadId: null }, data: { leadId } });
  return res.count;
}
