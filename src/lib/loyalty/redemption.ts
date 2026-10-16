import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/phone";
import { normalizePhoneMx } from "@/lib/customers";
import { UserError } from "@/lib/user-error";
import { emitDomainEvent } from "@/lib/domain-events";
import { reconcileMemberInTx } from "./reconcile";
import type { Prisma, FoodSale } from "@prisma/client";

export const redemptionSchema = z.object({
  action: z.enum(["quote", "reserve", "release"]),
  deviceId: z.string().min(1).max(100),
  orderId: z.string().uuid(),
  phone: z.string().max(30),
  subtotalCents: z.number().int().positive().max(10000000),
  rewardId: z.string().max(100).optional(),
  branchId: z.string().max(100).nullable().optional(),
});
export type RedemptionInput = z.infer<typeof redemptionSchema>;
export function rewardDiscountCents(type: string, value: number, subtotal: number) {
  if (!(value > 0) || !Number.isFinite(value) || !Number.isSafeInteger(subtotal) || subtotal <= 0) return 0;
  if (type === "DISCOUNT_PERCENT" && value <= 100) return Math.min(subtotal, Math.round(subtotal * value / 100));
  if (type === "DISCOUNT_AMOUNT") return Math.min(subtotal, Math.round(value * 100));
  return 0;
}

/** Reservation is durable, never expires automatically: a POS may sync a paid sale days later.
 * A failed/abandoned checkout can explicitly release it before a sale exists.
 */
export async function posRedemption(organizationId: string, input: RedemptionInput) {
  const phone = normalizePhoneMx(input.phone);
  const key = phone ? phoneKey(phone) : null;
  if (!key) throw new UserError("Revisa el teléfono del cliente.");
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { organizationId_phoneKey: { organizationId, phoneKey: key } } });
    if (!customer) return { status: "not_enrolled" as const };
    // Order lock serializes reserve, release and outbox ingestion for this order.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizationId}:${input.orderId}`}, 0))`;
    const existing = await tx.loyaltyPosRedemption.findUnique({ where: { organizationId_orderId: { organizationId, orderId: input.orderId } }, include: { reward: true } });
    if (existing && (existing.deviceId !== input.deviceId || existing.customerId !== customer.id || existing.subtotalCents !== input.subtotalCents)) throw new UserError("El canje no corresponde a esta cuenta.");
    if (input.action === "release") {
      if (existing?.status === "RESERVED") {
        if (await tx.foodSale.count({ where: { organizationId, externalOrderId: input.orderId } })) throw new UserError("La venta ya fue recibida; cancélala desde el POS.");
        await tx.loyaltyPosRedemption.update({ where: { id: existing.id }, data: { status: "RELEASED" } });
        await tx.auditLog.create({ data: { organizationId, action: "loyalty.pos_release", resource: "LoyaltyPosRedemption", resourceId: existing.id } });
      }
      return { status: "released" as const };
    }
    if (existing) {
      if (existing.status !== "RESERVED") throw new UserError("Esta cuenta ya terminó su canje. Inicia una cuenta nueva.");
      return { status: "reserved" as const, rewardId: existing.rewardId, name: existing.reward.rewardName, amountCents: existing.amountCents };
    }
    if (input.action === "reserve" && await tx.foodSale.count({ where: { organizationId, externalOrderId: input.orderId } })) throw new UserError("Esta venta ya fue recibida.");
    const reward = await tx.loyaltyReward.findFirst({ where: {
      organizationId, member: { organizationId, customerId: customer.id }, status: "AVAILABLE", missingVisits: 0,
      rewardValue: { not: null }, rewardType: { in: ["DISCOUNT_AMOUNT", "DISCOUNT_PERCENT"] },
      program: { organizationId, status: "ACTIVE", OR: [{ scope: "ORGANIZATION" }, { branchId: input.branchId ?? null, scope: "BRANCH" }] },
      posRedemptions: { none: { status: { in: ["RESERVED", "COMMITTED"] } } },
      ...(input.action === "reserve" || input.rewardId ? { id: input.rewardId ?? "" } : {}),
    }, orderBy: [{ earnedAt: "asc" }, { id: "asc" }] });
    if (!reward) return { status: "no_reward" as const };
    await tx.$queryRaw`SELECT id FROM "LoyaltyMember" WHERE id = ${reward.memberId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const current = await tx.loyaltyReward.findUniqueOrThrow({ where: { id: reward.id }, include: { posRedemptions: { where: { status: { in: ["RESERVED", "COMMITTED"] } } } } });
    if (current.status !== "AVAILABLE" || current.missingVisits || current.posRedemptions.length) return { status: "no_reward" as const };
    const amountCents = rewardDiscountCents(reward.rewardType, Number(reward.rewardValue), input.subtotalCents);
    if (!amountCents) return { status: "no_reward" as const };
    if (input.action === "reserve") {
      const reservation = await tx.loyaltyPosRedemption.create({ data: { organizationId, orderId: input.orderId, deviceId: input.deviceId, customerId: customer.id, rewardId: reward.id, amountCents, subtotalCents: input.subtotalCents } });
      await tx.auditLog.create({ data: { organizationId, action: "loyalty.pos_reserve", resource: "LoyaltyPosRedemption", resourceId: reservation.id, metadata: { orderId: input.orderId, deviceId: input.deviceId, amountCents } } });
    }
    return { status: input.action === "reserve" ? "reserved" as const : "quoted" as const, rewardId: reward.id, name: reward.rewardName, amountCents };
  });
}

/** Called by the durable sale-event consumer, under its order advisory lock. */
export async function settlePosRedemption(tx: Prisma.TransactionClient, sale: FoodSale, cancelled: boolean, eventId: string) {
  if (!sale.externalOrderId) return;
  const reservation = await tx.loyaltyPosRedemption.findUnique({ where: { organizationId_orderId: { organizationId: sale.organizationId, orderId: sale.externalOrderId } }, include: { reward: true } });
  if (!reservation || reservation.status === "RELEASED" || reservation.status === "CANCELLED") return;
  const organizationId = sale.organizationId;
  await tx.$queryRaw`SELECT id FROM "LoyaltyMember" WHERE id = ${reservation.reward.memberId} AND "organizationId" = ${organizationId} FOR UPDATE`;
  if (cancelled) {
    await tx.loyaltyPosRedemption.update({ where: { id: reservation.id }, data: { status: "CANCELLED" } });
    if (reservation.status === "COMMITTED") {
      await tx.loyaltyReward.update({ where: { id: reservation.rewardId }, data: { status: "AVAILABLE", redeemedAt: null, redeemedBranchId: null } });
      await reconcileMemberInTx(tx, organizationId, reservation.reward.memberId);
    }
  } else {
    if (reservation.status === "COMMITTED") return;
    if (sale.customerId !== reservation.customerId || Math.round(Number(sale.discountAmount ?? 0) * 100) !== reservation.amountCents || Math.round(Number(sale.grossAmount) * 100) + reservation.amountCents !== reservation.subtotalCents) throw new Error("loyalty_pos_sale_mismatch");
    await tx.loyaltyPosRedemption.update({ where: { id: reservation.id }, data: { status: "COMMITTED" } });
    // Honor the authorized discount even if an earning sale was cancelled while POS was offline;
    // reconciliation records the resulting deficit, rather than granting the reward twice.
    await tx.loyaltyReward.update({ where: { id: reservation.rewardId }, data: { status: "REDEEMED", redeemedAt: sale.occurredAt, redeemedBranchId: sale.branchId } });
    await reconcileMemberInTx(tx, organizationId, reservation.reward.memberId);
    await emitDomainEvent(tx, { organizationId, type: "loyalty.reward_redeemed", subjectType: "loyalty_member", subjectId: reservation.reward.memberId, occurredAt: sale.occurredAt,
      payload: { customerId: sale.customerId, rewardId: reservation.rewardId }, dedupeKey: `loyalty.pos_redeemed:${reservation.id}`, causationId: eventId });
  }
  await tx.auditLog.create({ data: { organizationId, action: cancelled ? "loyalty.pos_cancel" : "loyalty.pos_commit", resource: "LoyaltyPosRedemption", resourceId: reservation.id, metadata: { saleId: sale.id, eventId } } });
}
