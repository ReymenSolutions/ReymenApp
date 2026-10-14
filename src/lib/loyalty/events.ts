import { prisma } from "@/lib/prisma";
import { type StoredDomainEvent } from "@/lib/domain-events";
import { LoyaltyRuleError, registerVisitInTx } from "./service";
import { adjustSaleVisitAmount, voidSaleVisit } from "./reconcile";

/** No network calls and no dependency from the POS ingestion transaction.
 * Receipts and visit effects commit together. Receipt IDs survive outbox purge.
 * Sale/order locks serialize completion and cancellation even across workers.
 */
export async function consumeLoyaltyEvent(event: StoredDomainEvent): Promise<void> {
  if (event.type !== "sale.completed" && event.type !== "sale.cancelled") return;
  await prisma.$transaction(async (tx) => {
    const organizationId = event.organizationId;
    const entitlement = await tx.organizationModule.findUnique({ where: { organizationId_module: { organizationId, module: "LOYALTY" } } });
    if (!entitlement) return; // Existing organizations without Loyalty are unaffected.
    const sale = await tx.foodSale.findFirst({ where: { id: event.subjectId, organizationId } });
    if (!sale) throw new Error("loyalty_sale_missing");
    const operationKey = `${organizationId}:${sale.externalOrderId ?? sale.cancelsSaleId ?? sale.id}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${operationKey}, 0))`;
    if (await tx.loyaltyEventReceipt.findUnique({ where: { organizationId_eventId: { organizationId, eventId: event.id } } })) return;
    const record = async (outcome: string) => {
      await tx.loyaltyEventReceipt.create({ data: { organizationId, eventId: event.id, eventType: event.type, saleId: sale.id, outcome } });
    };
    // Resolve only the specific sale referenced by the event, never scan for new sales.
    // Older cancellation payloads may not carry cancelsSaleId; the stored relation
    // and external order recover it, including cancellation arriving before sale.
    let original = sale.grossAmount.lt(0)
      ? await tx.foodSale.findFirst({ where: { organizationId, grossAmount: { gt: 0 }, ...(sale.cancelsSaleId ? { id: sale.cancelsSaleId } : sale.externalOrderId ? { externalOrderId: sale.externalOrderId } : { id: "" }) }, orderBy: { createdAt: "asc" } })
      : sale;
    if (!original) { await record("original_not_received"); return; }
    if (original.externalOrderId) {
      const awarded = await tx.loyaltyVisit.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: `pos:${original.externalOrderId}` } } });
      if (awarded?.saleId && awarded.saleId !== original.id) original = await tx.foodSale.findFirstOrThrow({ where: { id: awarded.saleId, organizationId } });
    }
    const cancellations = await tx.foodSale.findMany({ where: { organizationId, grossAmount: { lt: 0 }, OR: [{ cancelsSaleId: original.id }, ...(original.externalOrderId ? [{ externalOrderId: original.externalOrderId }] : [])] } });
    // The existing producer deduplicates cancellation facts by order + amount.
    // Mirror that contract rather than count webhook retries twice.
    const amounts = new Map(cancellations.map((s) => [s.grossAmount.toString(), s.grossAmount]));
    const remaining = [...amounts.values()].reduce((n, amount) => n.add(amount), original.grossAmount);
    if (remaining.lte(0)) {
      await voidSaleVisit(tx, organizationId, original.id, event.id, event.occurredAt);
      await record("cancelled"); return;
    }
    if (event.type === "sale.cancelled") { await adjustSaleVisitAmount(tx, organizationId, original.id, remaining, event.id); await record("partial_return_stamp_retained"); return; }
    const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { isActive: true } });
    if (!org?.isActive || entitlement?.status !== "ACTIVE") { await record("module_disabled"); return; }
    const member = original.customerId ? await tx.loyaltyMember.findFirst({ where: { organizationId, customerId: original.customerId }, include: { program: true } }) : null;
    if (!member) { await record("not_enrolled"); return; }
    if (event.occurredAt < member.createdAt || event.occurredAt < member.program.createdAt || event.occurredAt < entitlement.enabledAt) { await record("before_enrollment_or_enablement"); return; }
    // Stable order key protects even a newly-created event / duplicate FoodSale.
    const idempotencyKey = `pos:${original.externalOrderId ?? original.id}`;
    try {
      const result = await registerVisitInTx(tx, { organizationId, memberId: member.id, employeeUserId: null, branchId: original.branchId,
        saleId: original.id, saleAmount: Number(original.grossAmount), idempotencyKey }, event.occurredAt);
      if (remaining.lt(original.grossAmount)) await adjustSaleVisitAmount(tx, organizationId, original.id, remaining, event.id);
      await record(result.replay ? "replay" : "earned");
    } catch (error) {
      if (!(error instanceof LoyaltyRuleError)) throw error;
      await record(error.code); // deliberate business skips; infrastructure errors retry.
    }
  }, { timeout: 15_000 });
}
