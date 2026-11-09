import { prisma } from "./prisma";

export const BILLING_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
/** A separate access gate: never rewrites purchased entitlements or administrative suspensions. */
export function billingAccess(periodEnd: Date | null, now = new Date()) {
  const suspendAt = periodEnd ? new Date(periodEnd.getTime() + BILLING_GRACE_MS) : null;
  return { suspendAt, suspended: suspendAt !== null && now.getTime() >= suspendAt.getTime() };
}
export async function isBillingSuspended(organizationId: string, now = new Date()) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { billingPeriodEnd: true } });
  return org ? billingAccess(org.billingPeriodEnd, now).suspended : false;
}
export function billingRecoveryPath(path: string) {
  return ["/portal/settings", "/portal/requests"].some(allowed => path === allowed || path.startsWith(`${allowed}/`));
}

export function billingAccessWhere(now = new Date()) {
  return { OR: [{ billingPeriodEnd: null }, { billingPeriodEnd: { gt: new Date(now.getTime() - BILLING_GRACE_MS) } }] };
}
