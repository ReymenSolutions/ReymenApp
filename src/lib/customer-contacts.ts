import { prisma } from "./prisma";
import { getPlan } from "./plans";
import { hasModule } from "./modules";
import { UserError } from "./user-error";
import { monthPeriod, METRIC_KEYS } from "./metrics";
import type { StoredDomainEvent } from "./domain-events";

/** Same identity and capacity lock for automatic and manual customer conversion. */
export async function ensureCustomerContact(organizationId: string, customerId: string, opts: { manual?: boolean; userId?: string } = {}) {
  if (!(await hasModule(organizationId, "CRM"))) return null;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { plan: true } });
  const limit = (await getPlan(org.plan)).limits.leads;
  return prisma.$transaction(async (tx) => {
    // Share the plan lock with every normal contact creation, including unlimited plans.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plancap:${organizationId}:leads`}))`;
    await tx.$queryRaw`SELECT id FROM "Customer" WHERE id = ${customerId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const customer = await tx.customer.findFirst({ where: { id: customerId, organizationId } });
    if (!customer || (!opts.manual && !customer.consentAccepted)) return null;
    const linked = customer.leadId ? await tx.lead.findFirst({ where: { id: customer.leadId, organizationId, deletedAt: null } }) : null;
    const existing = linked ?? await tx.lead.findFirst({ where: { organizationId, phoneKey: customer.phoneKey, deletedAt: null }, orderBy: { createdAt: "asc" } });
    if (!existing && limit !== null && await tx.lead.count({ where: { organizationId, deletedAt: null } }) >= limit) {
      if (opts.manual) throw new UserError(`Alcanzaste el límite de leads de tu plan (${limit}). Solicita más capacidad en Configuración.`);
      return null; // Sale remains valid; a later sync can retry after capacity becomes available.
    }
    const lead = existing ?? await tx.lead.create({ data: {
      organizationId, name: customer.name?.trim() || customer.phone, phone: customer.phone,
      phoneKey: customer.phoneKey, source: "pos", status: "WON", doNotContact: !customer.consentAccepted,
    } });
    await tx.customer.update({ where: { id: customer.id }, data: { leadId: lead.id } });
    await tx.conversation.updateMany({ where: { organizationId, phoneKey: customer.phoneKey, leadId: null }, data: { leadId: lead.id } });
    if (!existing) {
      await tx.auditLog.create({ data: { organizationId, userId: opts.userId ?? null, action: opts.manual ? "lead.create_from_customer" : "lead.auto_create_from_customer", resource: "Lead", resourceId: lead.id, metadata: { customerId, doNotContact: lead.doNotContact } } });
      const key = METRIC_KEYS.LEADS_CAPTURED;
      const period = monthPeriod();
      await tx.metric.upsert({ where: { organizationId_key_period: { organizationId, key, period } }, create: { organizationId, key, period, value: 1 }, update: { value: { increment: 1 } } });
    }
    return { leadId: lead.id, created: !existing };
  });
}

/** Retriable consumer: sale and consent must already be committed. */
export async function consumeCustomerContactEvent(event: StoredDomainEvent) {
  if (event.type === "customer.created") await ensureCustomerContact(event.organizationId, event.subjectId);
  if (event.type === "sale.completed" && typeof event.payload === "object" && event.payload && !Array.isArray(event.payload)) {
    const customerId = event.payload.customerId;
    if (typeof customerId === "string") await ensureCustomerContact(event.organizationId, customerId);
  }
}

/** Bounded reconciliation also covers customers who accepted contact before this feature. */
export async function syncCustomerContacts(organizationId: string, limit = 100) {
  if (!(await hasModule(organizationId, "CRM"))) return;
  const customers = await prisma.customer.findMany({ where: { organizationId, consentAccepted: true, leadId: null }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  for (const customer of customers) await ensureCustomerContact(organizationId, customer.id);
}
