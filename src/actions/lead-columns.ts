"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { assertModuleEnabled } from "@/lib/modules";
import { UserError } from "@/lib/user-error";
import { sanitizeLeadColumns, type LeadColumnPrefs } from "@/lib/lead-columns";
import { getActiveCustomFields } from "@/lib/custom-fields-db";

/** Guarda las columnas de la tabla de leads de la persona que inicia sesión (no afecta al resto del equipo). */
export async function updateLeadColumns(input: LeadColumnPrefs) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  const orgId = session.user.organizationId;
  await assertModuleEnabled(orgId, "CRM");

  const fields = await getActiveCustomFields(orgId);
  const prefs = sanitizeLeadColumns(input, fields.map((f) => f.key));
  await prisma.user.update({ where: { id: session.user.id }, data: { leadColumns: { hidden: prefs.hidden, custom: prefs.custom } } });
  revalidatePath("/portal/leads");
  return { success: true, prefs };
}
