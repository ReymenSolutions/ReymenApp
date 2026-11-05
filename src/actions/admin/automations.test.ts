// @vitest-environment node
import { afterAll, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg, fakeSession } from "@/test/helpers";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth(), isAdmin: (r: string) => r === "SUPER_ADMIN" }));
const { createAutomation, archiveAutomation, updateAutomation, toggleAutomationStatus } = await import("./automations");
let id = "";
const key = `capacity-${Date.now()}`;
afterAll(async () => { if (id) await cleanupOrg(id); await prisma.plan.deleteMany({ where: { key } }); });
it("enforces installed capacity for concurrent admin creation and both restoration paths", async () => {
  id = (await createTestOrg("Capacity admin")).id;
  await prisma.plan.create({ data: { key, name: "Capacity", nameEn: "Capacity", sortOrder: 999, priceMxn: 1, aiBudgetMxn: 0, maxAutomations: 1, modules: ["AUTOMATIONS"] } });
  await prisma.organization.update({ where: { id }, data: { plan: key } });
  auth.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
  const input = { organizationId: id, name: "Synthetic", type: "custom" };
  const results = await Promise.allSettled([createAutomation(input), createAutomation(input)]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  const first = await prisma.automation.findFirstOrThrow({ where: { organizationId: id } });
  await archiveAutomation(first.id);
  await createAutomation(input);
  await expect(updateAutomation(first.id, { status: "ACTIVE" })).rejects.toThrow(/límite/);
  await expect(toggleAutomationStatus(first.id)).rejects.toThrow(/límite/);
  auth.mockResolvedValue(fakeSession({ id: "owner", role: "OWNER", organizationId: id }));
  await expect(createAutomation(input)).rejects.toThrow(/autorizado/i);
});
