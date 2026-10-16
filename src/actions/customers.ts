"use server";

import { revalidatePath } from "next/cache";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { ensureCustomerContact } from "@/lib/customer-contacts";
import { assertModuleEnabled } from "@/lib/modules";
import { UserError } from "@/lib/user-error";
import { parseBirthday } from "@/lib/birthday";

/**
 * Convierte a un cliente del POS (alguien que compró) en contacto del CRM: crea el lead con su nombre y
 * teléfono, lo enlaza al cliente y a las conversaciones de WhatsApp de ese número. Si el cliente no dio
 * su consentimiento al cobrar, el contacto nace con "no contactar" activado: quien lo revise decide.
 */
export async function createLeadFromCustomer(customerId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "leads:create")) throw new UserError("No autorizado");
  const orgId = session.user.organizationId;
  await assertModuleEnabled(orgId, "CRM");

  const result = await ensureCustomerContact(orgId, customerId, { manual: true, userId: session.user.id });
  if (!result) throw new UserError("Cliente no encontrado");
  revalidatePath("/portal/customers");
  revalidatePath("/portal/leads");
  return { success: true, ...result };
}

/**
 * El equipo captura o corrige el cumpleaños de un cliente (solo día y mes). Es un dato personal: solo se guarda si el
 * cliente aceptó el contacto. Con `null` se borra.
 */
export async function setCustomerBirthday(customerId: string, birthday: { month: number; day: number } | null) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "food:manage")) throw new UserError("No autorizado");
  const orgId = session.user.organizationId;
  await assertModuleEnabled(orgId, "FOOD_OPS");

  const customer = await prisma.customer.findFirst({ where: { id: customerId, organizationId: orgId }, select: { id: true, consentAccepted: true } });
  if (!customer) throw new UserError("Cliente no encontrado");
  const parsed = birthday === null ? null : parseBirthday(birthday);
  if (birthday !== null && !parsed) throw new UserError("Fecha de cumpleaños no válida");
  if (parsed && !customer.consentAccepted) throw new UserError("El cliente no aceptó el contacto: no se puede guardar su cumpleaños");

  await prisma.customer.update({ where: { id: customer.id }, data: { birthMonth: parsed?.month ?? null, birthDay: parsed?.day ?? null } });
  await logAudit({ organizationId: orgId, userId: session.user.id, action: parsed ? "customer.birthday_set" : "customer.birthday_clear", resource: "Customer", resourceId: customer.id });
  revalidatePath("/portal/customers");
  return { success: true };
}
