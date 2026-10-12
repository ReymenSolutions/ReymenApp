// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertPlanCapacity } from "@/lib/plan-limits";
import { createTestOrg, createTestUser, cleanupOrg, generateWebhookSecret } from "@/test/helpers";

describe("assertPlanCapacity", () => {
  let org: { id: string };

  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
  });

  it("allows creation when the org is under its plan's leads limit", async () => {
    org = await createTestOrg("Plan Limits Org");
    await expect(assertPlanCapacity(org.id, "leads")).resolves.toBeUndefined();
  });

  it("blocks creation once the org's leads count reaches the starter limit", async () => {
    org = await createTestOrg("Plan Limits Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "starter" } });

    await prisma.lead.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        organizationId: org.id,
        name: `Lead ${i}`,
        source: "manual",
      })),
    });

    await expect(assertPlanCapacity(org.id, "leads")).rejects.toThrow(/límite de leads/);
  });

  it("does not count soft-deleted leads toward the limit", async () => {
    org = await createTestOrg("Plan Limits Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "starter" } });

    await prisma.lead.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        organizationId: org.id,
        name: `Lead ${i}`,
        source: "manual",
        deletedAt: new Date(),
      })),
    });

    await expect(assertPlanCapacity(org.id, "leads")).resolves.toBeUndefined();
  });

  it("blocks user invites once the org reaches its plan's user limit", async () => {
    org = await createTestOrg("Plan Limits Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "starter" } });

    await createTestUser(org.id, "AGENT", "agent1");
    await createTestUser(org.id, "AGENT", "agent2");

    await expect(assertPlanCapacity(org.id, "users")).rejects.toThrow(/límite de usuarios/);
  });

  it("does not count inactive users toward the user limit", async () => {
    org = await createTestOrg("Plan Limits Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "starter" } });

    const u1 = await createTestUser(org.id, "AGENT", "agent1");
    await createTestUser(org.id, "AGENT", "agent2");
    await prisma.user.update({ where: { id: u1.id }, data: { isActive: false } });

    await expect(assertPlanCapacity(org.id, "users")).resolves.toBeUndefined();
  });

  it("blocks automation installs once the org reaches its plan's automations limit", async () => {
    org = await createTestOrg("Plan Limits Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "starter" } });

    await prisma.automation.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        organizationId: org.id,
        name: `Automation ${i}`,
        type: "custom",
        webhookSecret: generateWebhookSecret(),
      })),
    });

    await expect(assertPlanCapacity(org.id, "automations")).rejects.toThrow(/límite de automatizaciones/);
  });

  it("does not count archived automations toward the limit", async () => {
    org = await createTestOrg("Plan Limits Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "starter" } });

    await prisma.automation.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        organizationId: org.id,
        name: `Automation ${i}`,
        type: "custom",
        webhookSecret: generateWebhookSecret(),
        status: "ARCHIVED",
      })),
    });

    await expect(assertPlanCapacity(org.id, "automations")).resolves.toBeUndefined();
  });

  it("uses the business plan's much higher limit", async () => {
    org = await createTestOrg("Plan Limits Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "business" } });

    await prisma.lead.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        organizationId: org.id,
        name: `Lead ${i}`,
        source: "manual",
      })),
    });

    await expect(assertPlanCapacity(org.id, "leads")).resolves.toBeUndefined();
  });

  // Business antes tenía un tope escondido de 99 usuarios/automatizaciones
  // (y 99999 leads) aunque la pantalla dijera "Ilimitado".
  it("never blocks a business org, even past the old hidden cap of 99 users", async () => {
    org = await createTestOrg("Plan Limits Org");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "business" } });

    await prisma.user.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        organizationId: org.id,
        email: `ent-${i}-${Date.now()}@test.local`,
        name: `User ${i}`,
        role: "AGENT" as const,
        passwordHash: "unused",
      })),
    });

    await expect(assertPlanCapacity(org.id, "users")).resolves.toBeUndefined();
  });
});
