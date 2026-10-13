// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { invalidatePlanCache } from "./plans";
import { withPlanCapacity } from "./plan-limits";

// AUD-014: la comprobación de la cuota y la creación son una sola operación por organización.
describe("withPlanCapacity", () => {
  let org: { id: string };
  beforeAll(async () => {
    await prisma.plan.upsert({ where: { key: "qa-cap-conc" }, update: { maxLeads: 3, isActive: true }, create: { key: "qa-cap-conc", name: "QA", nameEn: "QA", priceMxn: 1, aiBudgetMxn: 10, maxLeads: 3, sortOrder: 98 } });
    invalidatePlanCache();
    org = await createTestOrg("Plan Cap Concurrency");
    await prisma.organization.update({ where: { id: org.id }, data: { plan: "qa-cap-conc" } });
  });
  afterAll(async () => { await cleanupOrg(org.id); });

  it("10 altas simultáneas con tope 3 crean exactamente 3", { timeout: 30_000 }, async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) => withPlanCapacity(org.id, "leads", (tx) => tx.lead.create({ data: { organizationId: org.id, name: `Lead ${i}` } })))
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(7);
    expect(await prisma.lead.count({ where: { organizationId: org.id } })).toBe(3);
  });
});
