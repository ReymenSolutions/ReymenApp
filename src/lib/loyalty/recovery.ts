import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { recoverLegacyCooldownEvent } from "./events";

/** Explicit manager operation: only old, skipped POS events of this membership. */
export async function recoverLegacyPosVisits(organizationId: string, memberId: string, userId: string) {
  const member = await prisma.loyaltyMember.findFirst({ where: { organizationId, id: memberId }, include: { program: true, organization: { select: { isActive: true } } } });
  if (!member?.customerId) throw new UserError("Cliente no encontrado.");
  const entitlement = await prisma.organizationModule.findUnique({ where: { organizationId_module: { organizationId, module: "LOYALTY" } } });
  if (!member.organization.isActive || entitlement?.status !== "ACTIVE" || member.program.status !== "ACTIVE") throw new UserError("Activa el programa de Lealtad antes de recuperar las visitas.");
  const candidates = await prisma.$queryRaw<{ id: string }[]>`
    SELECT e.id FROM "LoyaltyEventReceipt" r
    JOIN "DomainEvent" e ON e.id = r."eventId" AND e."organizationId" = r."organizationId"
    JOIN "FoodSale" s ON s.id = r."saleId" AND s."organizationId" = r."organizationId"
    WHERE r."organizationId" = ${organizationId} AND r.outcome = 'cooldown'
      AND e.type = 'sale.completed' AND s."customerId" = ${member.customerId}
      AND e.payload->>'loyaltyMemberId' = ${memberId}
      AND NOT (e.payload ? 'loyaltyVisitCooldownMinutes')
    ORDER BY e."occurredAt", e.id LIMIT 101`;
  const hasMore = candidates.length > 100;
  let recovered = 0;
  for (const candidate of candidates.slice(0, 100)) {
    const event = await prisma.domainEvent.findFirst({ where: { id: candidate.id, organizationId } });
    if (event && await recoverLegacyCooldownEvent(event)) recovered++;
  }
  await prisma.auditLog.create({ data: { organizationId, userId, action: "loyalty.pos_visits_recover", resource: "LoyaltyMember", resourceId: memberId, metadata: { recovered, reviewed: Math.min(candidates.length, 100), hasMore } } });
  return { recovered, hasMore };
}
