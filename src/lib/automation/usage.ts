import { billingAccess } from "../billing-access";
import { prisma } from "@/lib/prisma";

/** UTC calendar month of admission. Pending/uncertain calls reserve capacity; retrying the same key does not reserve again. */
export async function reserveAutomationRun(organizationId: string, automationId: string, executionKey: string, now = new Date()) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`automation-usage:${organizationId}`}))`;
    const org = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { billingPeriodEnd: true, plan: true, isActive: true, customPlan: true, customMaxAutomationRuns: true } });
    if (billingAccess(org.billingPeriodEnd, now).suspended) return { allowed: false, reason: "billing_suspended" } as const;
    const entitlement = await tx.organizationModule.findUnique({ where: { organizationId_module: { organizationId, module: "AUTOMATIONS" } } });
    if (!org.isActive || entitlement?.status !== "ACTIVE") return { allowed: false, reason: "module_disabled" } as const;
    const automation = await tx.automation.findFirst({ where: { id: automationId, organizationId, status: "ACTIVE" } });
    if (!automation) return { allowed: false, reason: "automation_inactive" } as const;
    const existing = await tx.automationUsage.findUnique({ where: { organizationId_executionKey: { organizationId, executionKey } } });
    if (existing) return { allowed: existing.automationId === automationId && existing.state === "RESERVED", reason: existing.state.toLowerCase() };
    const period = now.toISOString().slice(0, 7);
    const plan = await tx.plan.findUnique({ where: { key: org.plan } });
    if (!plan) return { allowed: false, reason: "plan_unavailable" } as const;
    const monthlyLimit = org.customPlan ? org.customMaxAutomationRuns : plan.maxAutomationRuns;
    if (monthlyLimit !== null) {
      const used = await tx.automationUsage.count({ where: { organizationId, period, state: { in: ["RESERVED", "SUCCEEDED"] } } });
      if (used >= monthlyLimit) return { allowed: false, reason: "monthly_quota" } as const;
    }
    await tx.automationUsage.create({ data: { organizationId, automationId, executionKey, period } });
    return { allowed: true, reason: "reserved" } as const;
  });
}

/** Only a definitive provider callback settles a reservation. Network timeouts remain uncertain. */
export async function settleAutomationRun(organizationId: string, executionKey: string, success: boolean) {
  return prisma.automationUsage.updateMany({ where: { organizationId, executionKey, state: "RESERVED" }, data: { state: success ? "SUCCEEDED" : "RELEASED" } });
}
