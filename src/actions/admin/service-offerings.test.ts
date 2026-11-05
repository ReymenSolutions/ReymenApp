// @vitest-environment node
import { afterAll, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupOrg, fakeSession } from "@/test/helpers";
import { ALL_MODULES, assertModuleEnabled, getEnabledModules } from "@/lib/modules";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth(), isAdmin: (r: string) => ["ADMIN", "SUPER_ADMIN"].includes(r) }));
const { createClient, changePlan } = await import("./clients");
const { createPlan } = await import("./plans");
const { syncModulesToPlan, setOrganizationModule } = await import("./modules");
const { createAutomation } = await import("./automations");
const { createArticle, updateArticle } = await import("../knowledge-base");
const ids: string[] = [], keys: string[] = [];
const admin = () => auth.mockResolvedValue(fakeSession({ id: "admin1", role: "SUPER_ADMIN", organizationId: null }));
afterAll(async () => {
  for (const id of ids) await cleanupOrg(id);
  await prisma.plan.deleteMany({ where: { key: { in: keys } } });
});
it("onboards separate automation-only and chatbot-only customers without granting the other products", async () => {
  for (const offering of ["AUTOMATIONS", "AI_WHATSAPP"] as const) {
    admin();
    const key = `qa-${offering === "AUTOMATIONS" ? "auto" : "chat"}-${Date.now()}`;
    keys.push(key);
    await createPlan({ key, name: key, nameEn: key, sortOrder: 999, priceMxn: 500, maxUsers: 2, maxLeads: 0, maxAutomations: 1, maxAiAgents: 1, aiBudgetMxn: 25, modules: [offering], features: [] });
    const fd = new FormData();
    Object.entries({ orgName: key, userName: "Synthetic owner", userEmail: `${key}@test.local`, password: "Synthetic-only-123!" }).forEach(([k,v]) => fd.set(k,v));
    const { orgId } = await createClient(fd);
    ids.push(orgId);
    expect(await getEnabledModules(orgId)).toEqual([]);
    await changePlan(orgId, key);
    expect(await getEnabledModules(orgId)).toEqual([offering]);
    await syncModulesToPlan(orgId);
    expect(await getEnabledModules(orgId)).toEqual([offering]);
    for (const other of ALL_MODULES.filter(m => m !== offering)) await expect(assertModuleEnabled(orgId, other)).rejects.toThrow(/módulo/);
    if (offering === "AUTOMATIONS") {
      const created = await createAutomation({ organizationId: orgId, name: "Synthetic workflow", type: "custom" });
      expect(await prisma.automation.findUnique({ where: { id: created.id } })).toMatchObject({ organizationId: orgId });
    }
    const owner = await prisma.user.findFirstOrThrow({ where: { organizationId: orgId } });
    auth.mockResolvedValue(fakeSession(owner));
    await expect(syncModulesToPlan(orgId)).rejects.toThrow(/autorizado/i);
    if (offering === "AI_WHATSAPP") {
      await expect(createArticle({ title: "Synthetic hours", content: "Open 10–18" })).resolves.toMatchObject({ success: true });
      const source = await prisma.knowledgeBase.findFirstOrThrow({ where: { organizationId: orgId } });
      const foreignOwner = await prisma.user.findFirstOrThrow({ where: { organizationId: ids[0] } });
      admin();
      await setOrganizationModule({ orgId: ids[0], module: "AI_WHATSAPP", status: "ACTIVE", source: "ADMIN_GRANTED" });
      auth.mockResolvedValue(fakeSession(foreignOwner));
      await expect(updateArticle(source.id, { title: "Attempt", content: "Foreign" })).rejects.toThrow(/no encontrado/i);
      admin();
      await setOrganizationModule({ orgId: ids[0], module: "AI_WHATSAPP", status: "SUSPENDED", source: "ADMIN_GRANTED" });
    } else {
      await expect(createArticle({ title: "Blocked", content: "No chatbot contracted" })).rejects.toThrow(/módulo/);
    }
    admin();
    await setOrganizationModule({ orgId, module: offering, status: "SUSPENDED", source: "SUBSCRIBED" });
    await expect(assertModuleEnabled(orgId, offering)).rejects.toThrow(/módulo/);
    await syncModulesToPlan(orgId);
    expect(await getEnabledModules(orgId)).toEqual([offering]);
  }
});
