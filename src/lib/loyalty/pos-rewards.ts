import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizePhoneMx } from "@/lib/customers";
import { phoneKey } from "@/lib/phone";
import { UserError } from "@/lib/user-error";
import { redeemReward } from "./service";

export const posRewardsSchema = z.object({
  action: z.enum(["rewards.list", "reward.redeem"]), phone: z.string().max(30),
  branchId: z.string().min(1).max(100).nullable().optional(),
  rewardId: z.string().min(1).max(100).optional(), requestId: z.string().uuid().optional(),
  deviceId: z.string().min(1).max(100), employeeId: z.string().min(1).max(100).optional(),
  actorRole: z.enum(["admin", "manager", "cashier"]).optional(),
});
export async function posRewards(organizationId: string, input: z.infer<typeof posRewardsSchema>) {
  const phone = normalizePhoneMx(input.phone);
  const key = phone ? phoneKey(phone) : null;
  if (!key) throw new UserError("Revisa el teléfono del cliente.");
  const customer = await prisma.customer.findUnique({ where: { organizationId_phoneKey: { organizationId, phoneKey: key } } });
  if (!customer) return { status: "not_found", rewards: [] };
  if (input.action === "reward.redeem") {
    if (!input.rewardId || !input.requestId || !input.employeeId || !input.actorRole) throw new UserError("Confirma el PIN del cajero para canjear.");
    const reward = await redeemReward({ organizationId, rewardId: input.rewardId, branchId: input.branchId ?? null,
      pos: { requestId: input.requestId, deviceId: input.deviceId, employeeId: input.employeeId, customerId: customer.id } });
    return { status: "redeemed", rewardId: reward.id, name: reward.rewardName };
  }
  const rewards = await prisma.loyaltyReward.findMany({ where: {
    organizationId, member: { organizationId, customerId: customer.id }, status: "AVAILABLE", missingVisits: 0,
    program: { organizationId, status: "ACTIVE", OR: [{ scope: "ORGANIZATION" }, { scope: "BRANCH", branchId: input.branchId ?? null }] },
    posRedemptions: { none: { status: { in: ["RESERVED", "COMMITTED"] } } },
  }, orderBy: [{ earnedAt: "asc" }, { id: "asc" }], take: 100,
    select: { id: true, rewardName: true, rewardDescription: true, rewardType: true, rewardValue: true, earnedAt: true, program: { select: { name: true } } } });
  return { status: "found", customerName: customer.name, rewards: rewards.map(r => ({
    id: r.id, name: r.rewardName, description: r.rewardDescription, program: r.program.name,
    earnedAt: r.earnedAt.toISOString(), kind: (r.rewardType === "DISCOUNT_AMOUNT" || r.rewardType === "DISCOUNT_PERCENT") && Number(r.rewardValue) > 0 ? "discount" : "manual",
  })) };
}
