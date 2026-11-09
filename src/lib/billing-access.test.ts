// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "./prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { billingAccess, billingRecoveryPath, isBillingSuspended } from "./billing-access";
import { hasModule, hasContractedModule, getEnabledModules } from "./modules";
import { recordPayment } from "./billing";
import { assertPilotAuthority } from "./ai/pilot/budget";
import { reserveAutomationRun } from "./automation/usage";

describe("three-day grace and non-destructive recovery", () => {
  let org: { id: string };
  beforeAll(async () => { org = await createTestOrg("Billing grace"); });
  afterAll(async () => { await cleanupOrg(org.id); });
  it("suspends at exactly 72 hours, not before; null never enrolls an account", () => {
    const due = new Date("2026-11-01T18:30:00Z");
    expect(billingAccess(due, new Date("2026-11-04T18:29:59.999Z")).suspended).toBe(false);
    expect(billingAccess(due, new Date("2026-11-04T18:30:00Z")).suspended).toBe(true);
    expect(billingAccess(null).suspended).toBe(false);
    expect(billingRecoveryPath("/portal/settings")).toBe(true);
    expect(billingRecoveryPath("/portal/requests/new")).toBe(true);
    expect(billingRecoveryPath("/portal/settings-other")).toBe(false);
    expect(billingRecoveryPath("/portal/dashboard")).toBe(false);
  });
  it("denies module access and automated runs, keeps POS ingestion entitlements, restores only contracted active modules", async () => {
    await prisma.organization.update({ where: { id: org.id }, data: { billingPeriodEnd: new Date(Date.now() - 4 * 86400_000) } });
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "AI_WHATSAPP" } }, data: { status: "SUSPENDED" } });
    const before = await prisma.organizationModule.findMany({ where: { organizationId: org.id }, orderBy: { module: "asc" } });
    const owner = await createTestUser(org.id, "OWNER", "overdue-owner");
    await expect(prisma.$transaction(tx => assertPilotAuthority(tx, org.id, owner.id))).rejects.toThrow("No autorizado");
    expect(await isBillingSuspended(org.id)).toBe(true);
    expect(await hasModule(org.id, "CRM")).toBe(false);
    expect(await getEnabledModules(org.id)).toEqual([]);
    expect(await hasContractedModule(org.id, "CRM")).toBe(true);
    expect(await reserveAutomationRun(org.id, "no-run", "blocked")).toMatchObject({ allowed: false, reason: "billing_suspended" });
    await recordPayment(org.id, { amountMxn: 500, method: "TRANSFER", externalRef: "grace-payment" });
    expect(await isBillingSuspended(org.id)).toBe(false);
    expect(await hasModule(org.id, "CRM")).toBe(true);
    expect(await hasModule(org.id, "AI_WHATSAPP")).toBe(false);
    expect(await prisma.organizationModule.findMany({ where: { organizationId: org.id }, orderBy: { module: "asc" } })).toEqual(before);
  });
  it("concurrent retries record a payment only once", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => recordPayment(org.id, { amountMxn: 500, method: "STRIPE", externalRef: "concurrent-invoice" })));
    expect(results.filter(r => r.applied)).toHaveLength(1);
  });
});
