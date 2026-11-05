// @vitest-environment node
import { it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { reconcilePlanEntitlements } from "./plan-entitlements";
let id = "";
afterAll(async () => { if (id) await cleanupOrg(id); });
it("replaces subscribed products, preserves admin overrides and keeps data on downgrade", async () => {
  id = (await createTestOrg("Entitlement reconciliation")).id;
  await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: id, module: "CRM" } }, data: { source: "ADMIN_GRANTED" } });
  await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: id, module: "AI_WHATSAPP" } }, data: { source: "ADMIN_GRANTED", status: "SUSPENDED" } });
  const a = await prisma.automation.create({ data: { organizationId: id, name: "Keep", type: "custom", webhookSecret: "synthetic" } });
  await prisma.$transaction(tx => reconcilePlanEntitlements(tx, id, ["AI_WHATSAPP"]));
  const rows = await prisma.organizationModule.findMany({ where: { organizationId: id } });
  expect(rows.find(r => r.module === "CRM")?.status).toBe("ACTIVE");
  expect(rows.find(r => r.module === "AUTOMATIONS")?.status).toBe("SUSPENDED");
  expect(rows.find(r => r.module === "AI_WHATSAPP")?.status).toBe("SUSPENDED");
  expect(await prisma.automation.findUnique({ where: { id: a.id } })).not.toBeNull();
  await expect(prisma.$transaction(async tx => { await reconcilePlanEntitlements(tx, id, ["AUTOMATIONS"]); throw new Error("rollback"); })).rejects.toThrow("rollback");
  expect((await prisma.organizationModule.findUniqueOrThrow({ where: { organizationId_module: { organizationId: id, module: "AUTOMATIONS" } } })).status).toBe("SUSPENDED");
});
