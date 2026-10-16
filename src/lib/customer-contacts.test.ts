// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "./prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import * as plans from "./plans";
import { ensureCustomerContact, syncCustomerContacts } from "./customer-contacts";

describe("automatic customer contacts", () => {
  let org: { id: string };
  let other: { id: string };
  beforeAll(async () => { org = await createTestOrg("Auto contacts"); other = await createTestOrg("Other contacts"); });
  afterAll(async () => { await cleanupOrg(org.id); await cleanupOrg(other.id); });
  const customer = (phone: string, consentAccepted = true) => prisma.customer.create({ data: { organizationId: org.id, phone: `+52${phone}`, phoneKey: phone, name: "Damian Alvarez", consentAccepted } });

  it("creates a won contact and links its purchase identity exactly once under concurrency", async () => {
    const c = await customer("5512340001");
    const results = await Promise.all([ensureCustomerContact(org.id, c.id), ensureCustomerContact(org.id, c.id)]);
    expect(results.filter(r => r?.created)).toHaveLength(1);
    const lead = await prisma.lead.findFirstOrThrow({ where: { organizationId: org.id, phoneKey: c.phoneKey } });
    expect(lead).toMatchObject({ name: c.name, status: "WON", source: "pos", doNotContact: false });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).leadId).toBe(lead.id);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "lead.auto_create_from_customer", resourceId: lead.id } })).toBe(1);
  });
  it("requires contact consent, including existing customers later accepting", async () => {
    const c = await customer("5512340002", false);
    expect(await ensureCustomerContact(org.id, c.id)).toBeNull();
    await prisma.customer.update({ where: { id: c.id }, data: { consentAccepted: true } });
    expect(await ensureCustomerContact(org.id, c.id)).toMatchObject({ created: true });
  });
  it("reuses a contact without overriding an explicit do-not-contact restriction", async () => {
    const c = await customer("5512340003");
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Existing", phoneKey: c.phoneKey, doNotContact: true } });
    expect(await ensureCustomerContact(org.id, c.id)).toEqual({ leadId: lead.id, created: false });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).doNotContact).toBe(true);
  });
  it("isolates organizations and does not create contacts without CRM", async () => {
    const c = await customer("5512340004");
    expect(await ensureCustomerContact(other.id, c.id)).toBeNull();
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "CRM" } }, data: { status: "SUSPENDED" } });
    try { expect(await ensureCustomerContact(org.id, c.id)).toBeNull(); }
    finally { await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "CRM" } }, data: { status: "ACTIVE" } }); }
  });
  it("respects capacity without rejecting a sale identity, and retries when capacity is restored", async () => {
    const c = await customer("5512340007");
    const plan = await plans.getPlan((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan);
    const mock = vi.spyOn(plans, "getPlan").mockResolvedValue({ ...plan, limits: { ...plan.limits, leads: 0 } });
    try {
      expect(await ensureCustomerContact(org.id, c.id)).toBeNull();
      expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).leadId).toBeNull();
      // A full plan must still allow reusing a contact that already exists.
      const existing = await customer("5512340008");
      const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Existing", phoneKey: existing.phoneKey } });
      expect(await ensureCustomerContact(org.id, existing.id)).toEqual({ leadId: lead.id, created: false });
    } finally { mock.mockRestore(); }
    expect(await ensureCustomerContact(org.id, c.id)).toMatchObject({ created: true });
  });
  it("reconciles already accepted customers, preserving those without consent", async () => {
    const accepted = await customer("5512340005");
    const declined = await customer("5512340006", false);
    await syncCustomerContacts(org.id);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: accepted.id } })).leadId).not.toBeNull();
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: declined.id } })).leadId).toBeNull();
  });
});
