import { settlePosRedemption } from "./redemption";
import { prisma } from "@/lib/prisma";
import { type StoredDomainEvent } from "@/lib/domain-events";
import { LoyaltyRuleError, registerVisitInTx } from "./service";
import { adjustSaleVisitAmount, voidSaleVisit } from "./reconcile";

/** No network calls and no dependency from the POS ingestion transaction.
 * Receipts and visit effects commit together. Receipt IDs survive outbox purge.
 * Sale/order locks serialize completion and cancellation even across workers.
 */
export async function consumeLoyaltyEvent(event: StoredDomainEvent): Promise<void> {
  await applyLoyaltyEvent(event, false);
}

/** Manager recovery is limited again by the original receipt and event policy. */
export async function recoverLegacyCooldownEvent(event: StoredDomainEvent): Promise<boolean> {
  return applyLoyaltyEvent(event, true);
}

async function applyLoyaltyEvent(event: StoredDomainEvent, recovery: boolean): Promise<boolean> {
  if (event.type !== "sale.completed" && event.type !== "sale.cancelled") return false;
  return prisma.$transaction(async (tx) => {
    const organizationId = event.organizationId;
    const entitlement = await tx.organizationModule.findUnique({ where: { organizationId_module: { organizationId, module: "LOYALTY" } } });
    if (!entitlement && !(await tx.loyaltyPosRedemption.count({ where: { organizationId, status: { in: ["RESERVED", "COMMITTED"] } } }))) return false; // Existing organizations without Loyalty are unaffected.
    const sale = await tx.foodSale.findFirst({ where: { id: event.subjectId, organizationId } });
    if (!sale) throw new Error("loyalty_sale_missing");
    const operationKey = `${organizationId}:${sale.externalOrderId ?? sale.cancelsSaleId ?? sale.id}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${operationKey}, 0))`;
    const receipt = await tx.loyaltyEventReceipt.findUnique({ where: { organizationId_eventId: { organizationId, eventId: event.id } } });
    const payload = event.payload as Record<string, unknown>;
    if (recovery && (!receipt || receipt.outcome !== "cooldown" || event.type !== "sale.completed" || "loyaltyVisitCooldownMinutes" in payload)) return false;
    if (receipt && !recovery) return false;
    const record = async (outcome: string) => {
      if (receipt) {
        if (outcome === "earned" || outcome === "replay" || outcome === "cancelled") await tx.loyaltyEventReceipt.update({ where: { id: receipt.id }, data: { outcome } });
      } else await tx.loyaltyEventReceipt.create({ data: { organizationId, eventId: event.id, eventType: event.type, saleId: sale.id, outcome } });
    };
    // Resolve only the specific sale referenced by the event, never scan for new sales.
    // Older cancellation payloads may not carry cancelsSaleId; the stored relation
    // and external order recover it, including cancellation arriving before sale.
    let original = event.type === "sale.cancelled"
      ? await tx.foodSale.findFirst({ where: { organizationId, grossAmount: { gte: 0 }, isCancellation: false, cancelsSaleId: null, ...(sale.cancelsSaleId ? { id: sale.cancelsSaleId } : sale.externalOrderId ? { externalOrderId: sale.externalOrderId } : { id: "" }) }, orderBy: { createdAt: "asc" } })
      : sale;
    if (!original) { await record("original_not_received"); return false; }
    if (original.externalOrderId) {
      const awarded = await tx.loyaltyVisit.findUnique({ where: { organizationId_idempotencyKey: { organizationId, idempotencyKey: `pos:${original.externalOrderId}` } } });
      if (awarded?.saleId && awarded.saleId !== original.id) original = await tx.foodSale.findFirstOrThrow({ where: { id: awarded.saleId, organizationId } });
    }
    const cancellations = await tx.foodSale.findMany({ where: { organizationId, id: { not: original.id }, AND: [{ OR: [{ grossAmount: { lt: 0 } }, { isCancellation: true }] }], OR: [{ cancelsSaleId: original.id }, ...(original.externalOrderId ? [{ externalOrderId: original.externalOrderId }] : [])] } });
    // The existing producer deduplicates cancellation facts by order + amount.
    // Mirror that contract rather than count webhook retries twice.
    const amounts = new Map(cancellations.map((s) => [s.grossAmount.toString(), s.grossAmount]));
    const remaining = [...amounts.values()].reduce((n, amount) => n.add(amount), original.grossAmount);
    const fullyCancelled = cancellations.length > 0 && remaining.lte(0);
    await settlePosRedemption(tx, original, fullyCancelled, event.id);
    if (remaining.lte(0)) {
      await voidSaleVisit(tx, organizationId, original.id, event.id, event.occurredAt);
      await record("cancelled"); return false;
    }
    if (event.type === "sale.cancelled") { await adjustSaleVisitAmount(tx, organizationId, original.id, remaining, event.id); await record("partial_return_stamp_retained"); return false; }
    const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { isActive: true } });
    if (!org?.isActive || entitlement?.status !== "ACTIVE") { await record("module_disabled"); return false; }
    const selectedId = typeof payload.loyaltyMemberId === "string" ? payload.loyaltyMemberId : null;
    const member = original.customerId ? await tx.loyaltyMember.findFirst({ where: { organizationId, customerId: original.customerId,
      ...(selectedId ? { id: selectedId } : "loyaltyMemberId" in payload ? { id: "" } : { isSelected: true }) }, include: { program: true } }) : null;
    if (!member) { await record("not_enrolled"); return false; }
    // A legacy cooldown receipt already proved entitlement before a later module reactivation.
    if (event.occurredAt < member.createdAt || event.occurredAt < member.program.createdAt || (!recovery && event.occurredAt < entitlement!.enabledAt)) { await record("before_enrollment_or_enablement"); return false; }
    // Stable order key protects even a newly-created event / duplicate FoodSale.
    const idempotencyKey = `pos:${original.externalOrderId ?? original.id}`;
    try {
      const result = await registerVisitInTx(tx, { organizationId, memberId: member.id, employeeUserId: null, branchId: original.branchId,
        saleId: original.id, saleAmount: Number(original.grossAmount), idempotencyKey,
        posCooldownMinutes: recovery ? 0 : (Number.isInteger(payload.loyaltyVisitCooldownMinutes) && Number(payload.loyaltyVisitCooldownMinutes) >= 0 && Number(payload.loyaltyVisitCooldownMinutes) <= 525600 ? Number(payload.loyaltyVisitCooldownMinutes) : undefined) }, event.occurredAt);
      if (remaining.lt(original.grossAmount)) await adjustSaleVisitAmount(tx, organizationId, original.id, remaining, event.id);
      await record(result.replay ? "replay" : "earned");
      return !result.replay;
    } catch (error) {
      if (!(error instanceof LoyaltyRuleError)) throw error;
      await record(error.code);
      return false; // deliberate business skips; infrastructure errors retry.
    }
  }, { timeout: 15_000 });
}
