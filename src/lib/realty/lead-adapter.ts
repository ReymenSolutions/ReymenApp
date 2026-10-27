// Solo servidor. Adaptador Realty → CRM: el contacto de un prospecto es
// siempre un Lead del CRM existente. Realty nunca guarda nombre/teléfono/
// correo propios: si ya hay un Lead con ese teléfono (o correo) en la
// organización se reutiliza; si no, se crea con el mismo camino que el CRM
// (tope del plan, llave de teléfono, enlace de conversaciones y clientes,
// auditoría y métrica). No modifica ninguna interfaz del CRM.

import { prisma } from "@/lib/prisma";
import { withPlanCapacity } from "@/lib/plan-limits";
import { phoneKey } from "@/lib/phone";
import { linkOrphanConversations, linkOrphanCustomers } from "@/lib/crm-link";
import { logAudit } from "@/lib/audit";
import { recordMetric, METRIC_KEYS } from "@/lib/metrics";
import { assertOrgLead } from "@/lib/org-guards";
import { UserError } from "@/lib/user-error";

export interface ProspectContact {
  /** Lead existente elegido en el formulario. */
  leadId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
}

/** Devuelve el id del Lead del prospecto y si se creó uno nuevo. */
/** `userId` null = alta pública (formulario de la landing), sin sesión. */
export async function ensureLeadForProspect(organizationId: string, userId: string | null, c: ProspectContact): Promise<{ leadId: string; created: boolean }> {
  if (c.leadId) {
    await assertOrgLead(organizationId, c.leadId);
    return { leadId: c.leadId, created: false };
  }
  const name = c.name?.trim();
  if (!name) throw new UserError("Indica el nombre del prospecto o elige un contacto existente.");
  const key = phoneKey(c.phone);
  const email = c.email?.trim().toLowerCase() || null;
  if (key || email) {
    const existing = await prisma.lead.findFirst({
      where: { organizationId, deletedAt: null, OR: [...(key ? [{ phoneKey: key }] : []), ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : [])] },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (existing) return { leadId: existing.id, created: false };
  }
  const lead = await withPlanCapacity(organizationId, "leads", (tx) =>
    tx.lead.create({
      data: { organizationId, name, phone: c.phone?.trim() || null, phoneKey: key, email, source: c.source?.trim() || "realty", tags: ["realty"] },
    }),
  );
  await linkOrphanConversations(organizationId, lead.id, lead.phone);
  await linkOrphanCustomers(organizationId, lead.id, lead.phone);
  await logAudit({ organizationId, userId, action: "lead.create", resource: "Lead", resourceId: lead.id, metadata: { name: lead.name, source: lead.source, via: "realty" } });
  await recordMetric(organizationId, METRIC_KEYS.LEADS_CAPTURED);
  return { leadId: lead.id, created: true };
}
