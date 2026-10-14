import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { emitDomainEvent } from "@/lib/domain-events";

/** Caller holds the member row lock. Closed cycles retain their original goal.
 * A cancelled stamp invalidates that cycle's unredeemed reward. An already
 * delivered reward is never erased: missing stamps become a visible deficit,
 * filled by subsequent visits before a new reward can be earned.
 */
export async function reconcileMemberInTx(tx: Prisma.TransactionClient, organizationId: string, memberId: string) {
  await tx.loyaltyMember.findFirstOrThrow({ where: { id: memberId, organizationId } });
  const where = { organizationId, memberId, status: "CONFIRMED" as const };
  const groups = await tx.loyaltyVisit.groupBy({ by: ["cycleNumber"], where, _count: { _all: true } });
  const counts = new Map(groups.map(g => [g.cycleNumber, g._count._all]));
  const totals = await tx.loyaltyVisit.aggregate({ where, _count: { _all: true, saleAmount: true }, _sum: { saleAmount: true }, _min: { occurredAt: true }, _max: { occurredAt: true } });
  const rewards = await tx.loyaltyReward.findMany({ where: { organizationId, memberId }, orderBy: { cycleNumber: "asc" } });
  let deficitVisits = 0;
  for (const reward of rewards) {
    const missingVisits = Math.max(0, reward.visitGoal - (counts.get(reward.cycleNumber) ?? 0));
    deficitVisits += missingVisits;
    const status = reward.status === "REDEEMED" ? "REDEEMED" : missingVisits > 0 ? "VOIDED" : "AVAILABLE";
    if (missingVisits !== reward.missingVisits || status !== reward.status) {
      await tx.loyaltyReward.update({ where: { id: reward.id }, data: { missingVisits, status } });
      await tx.auditLog.create({ data: { organizationId, action: "loyalty.reward_reconcile", resource: "LoyaltyReward", resourceId: reward.id, metadata: { previousStatus: reward.status, status, missingVisits } } });
    }
  }
  const cycleNumber = Math.max(1, ...rewards.map((r) => r.cycleNumber + 1));
  return tx.loyaltyMember.update({ where: { id: memberId }, data: {
    cycleNumber, cycleVisits: counts.get(cycleNumber) ?? 0, deficitVisits,
    totalVisits: totals._count._all, visitsWithAmount: totals._count.saleAmount,
    totalSpent: totals._sum.saleAmount ?? new Prisma.Decimal(0),
    firstVisitAt: totals._min.occurredAt, lastVisitAt: totals._max.occurredAt,
  } });
}

export async function reconcileLoyaltyMember(organizationId: string, memberId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "LoyaltyMember" WHERE id = ${memberId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const member = await reconcileMemberInTx(tx, organizationId, memberId);
    await tx.auditLog.create({ data: { organizationId, userId, action: "loyalty.member_reconcile", resource: "LoyaltyMember", resourceId: memberId } });
    return { totalVisits: member.totalVisits, deficitVisits: member.deficitVisits };
  });
}

/** Reversal and its audit/outbox commit together; safe on repeat or after redemption. */
export async function voidSaleVisit(tx: Prisma.TransactionClient, organizationId: string, saleId: string, eventId: string, occurredAt: Date) {
  const visit = await tx.loyaltyVisit.findUnique({ where: { organizationId_saleId: { organizationId, saleId } } });
  if (!visit) return;
  await tx.$queryRaw`SELECT id FROM "LoyaltyMember" WHERE id = ${visit.memberId} AND "organizationId" = ${organizationId} FOR UPDATE`;
  const changed = await tx.loyaltyVisit.updateMany({ where: { id: visit.id, organizationId, status: "CONFIRMED" }, data: { status: "VOIDED" } });
  if (!changed.count) return;
  const member = await reconcileMemberInTx(tx, organizationId, visit.memberId);
  await tx.auditLog.create({ data: { organizationId, action: "loyalty.visit_reverse", resource: "LoyaltyVisit", resourceId: visit.id, metadata: { saleId, eventId } } });
  await emitDomainEvent(tx, { organizationId, type: "loyalty.visit_reversed", subjectType: "loyalty_member", subjectId: member.id, occurredAt,
    payload: { customerId: member.customerId, visitId: visit.id, saleId }, dedupeKey: `loyalty.visit_reversed:${visit.id}`, causationId: eventId });
}

/** Partial return keeps its visit while a positive purchase remains. */
export async function adjustSaleVisitAmount(tx: Prisma.TransactionClient, organizationId: string, saleId: string, amount: Prisma.Decimal, eventId: string) {
  const visit = await tx.loyaltyVisit.findUnique({ where: { organizationId_saleId: { organizationId, saleId } } });
  if (!visit) return;
  await tx.$queryRaw`SELECT id FROM "LoyaltyMember" WHERE id = ${visit.memberId} AND "organizationId" = ${organizationId} FOR UPDATE`;
  const current = await tx.loyaltyVisit.findUniqueOrThrow({ where: { id: visit.id } });
  if (current.status !== "CONFIRMED" || current.saleAmount?.equals(amount)) return;
  await tx.loyaltyVisit.update({ where: { id: visit.id }, data: { saleAmount: amount } });
  await reconcileMemberInTx(tx, organizationId, visit.memberId);
  await tx.auditLog.create({ data: { organizationId, action: "loyalty.sale_amount_adjust", resource: "LoyaltyVisit", resourceId: visit.id, metadata: { eventId, before: current.saleAmount?.toString() ?? null, after: amount.toString() } } });
}
