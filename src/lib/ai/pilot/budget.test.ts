// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { budgetDay, getBudgetState, reserveBudget } from "../budget";
import { configurePilotBudget, reservePilotRoot, beginPilotRoot, cancelUnusedPilotRoot, PILOT_LIMITS } from "./budget";
const orgs: string[] = [], admins: string[] = [];
const NOW = new Date("2026-10-21T18:00:00Z");
async function fixture() {
  const org = await createTestOrg("Pilot budget fixture"); orgs.push(org.id);
  const user = await createTestUser(org.id, "OWNER", "pilot-owner"), admin = await createTestUser(null, "ADMIN", "pilot-admin"); admins.push(admin.id);
  await prisma.organization.update({ where: { id: org.id }, data: { createdAt: new Date("2026-01-01Z"), timezone: "America/Mexico_City" } });
  await prisma.aiBudgetSetting.create({ data: { organizationId: org.id, monthlyBudgetMxn: 1000 } });
  await configurePilotBudget(org.id, admin.id, true, 0);
  return { org, user, admin };
}
beforeEach(() => vi.stubEnv("AI_MARK_PILOT_BUDGET_ENABLED", "true"));
afterEach(async () => { vi.unstubAllEnvs(); for (const id of orgs.splice(0)) await cleanupOrg(id); await prisma.user.deleteMany({ where: { id: { in: admins.splice(0) } } }); });
describe("private Mark pilot budget admission", () => {
  it("defaults to 25 daily, 500 monthly and 1 per root without activating a provider", async () => {
    const f = await fixture(), row = await reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW);
    expect(PILOT_LIMITS).toMatchObject({ daily: 25, monthly: 500, root: 1 });
    expect(row.rootLimitMxn.toString()).toBe("1"); expect(row.holdMxn.toString()).toBe("1");
    expect(await prisma.aiUsage.count({ where: { organizationId: f.org.id } })).toBe(0);
    expect(await prisma.agentInstance.count({ where: { organizationId: f.org.id } })).toBe(0);
  });
  it("serializes 26 concurrent admissions so only 25 MXN is held", async () => {
    const f = await fixture();
    const result = await Promise.allSettled(Array.from({ length: 26 }, () => reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW)));
    expect(result.filter(r => r.status === "fulfilled")).toHaveLength(25);
    expect(result.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((await getBudgetState(f.org.id, NOW)).reservedMxn).toBe(25);
  });
  it("deduplicates concurrent requests and never revives a closed root", async () => {
    const f = await fixture(), key = randomUUID();
    const rows = await Promise.all([reservePilotRoot(f.org.id, f.user.id, key, NOW), reservePilotRoot(f.org.id, f.user.id, key, NOW)]);
    expect(rows[0].id).toBe(rows[1].id);
    await cancelUnusedPilotRoot(f.org.id, f.user.id, rows[0].id);
    expect((await reservePilotRoot(f.org.id, f.user.id, key, NOW)).state).toBe("CLOSED");
    await expect(beginPilotRoot(f.org.id, f.user.id, rows[0].id, NOW)).rejects.toThrow();
  });
  it("counts ledger spend plus holds, blocks at monthly cap, and respects the global tenant cap", async () => {
    const f = await fixture();
    await prisma.aiUsage.create({ data: { organizationId: f.org.id, agentKey: PILOT_LIMITS.agentKey, requestId: randomUUID(), provider: "fixture", model: "fixture", operation: "probe", origin: "webchat", status: "SUCCEEDED", costMxn: 499.5, createdAt: new Date("2026-10-20T18:00Z") } });
    await expect(reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW)).rejects.toThrow(/agotado/);
    await prisma.aiUsage.deleteMany({ where: { organizationId: f.org.id } });
    await prisma.aiBudgetSetting.update({ where: { organizationId: f.org.id }, data: { monthlyBudgetMxn: "0.99" } });
    await expect(reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW)).rejects.toThrow(/agotado/);
  });
  it("includes durable pilot holds in legacy reservations even when the pilot flag is switched off", async () => {
    const f = await fixture(); await prisma.aiBudgetSetting.update({ where: { organizationId: f.org.id }, data: { monthlyBudgetMxn: 1 } });
    await reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW);
    vi.stubEnv("AI_MARK_PILOT_BUDGET_ENABLED", "false");
    const usage = await prisma.aiUsage.create({ data: { organizationId: f.org.id, requestId: randomUUID(), provider: "fixture", model: "fixture", operation: "draft", origin: "webchat", createdAt: NOW } });
    const { Prisma } = await import("@prisma/client");
    expect(await reserveBudget(f.org.id, usage.id, { provider: "fixture", model: "fixture", costMxn: new Prisma.Decimal("0.01") }, null, NOW)).toEqual({ ok: false, code: "BUDGET_EXHAUSTED" });
  });
  it("rejects other actors and organizations, revoked roles/modules and inactive admins", async () => {
    const f = await fixture(), other = await fixture(), row = await reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW);
    await expect(beginPilotRoot(other.org.id, other.user.id, row.id, NOW)).rejects.toThrow(/encontrada/);
    await expect(prisma.aiUsage.create({ data: { organizationId: other.org.id, pilotRootId: row.id, requestId: randomUUID(), provider: "fixture", model: "fixture", operation: "probe", origin: "webchat" } })).rejects.toThrow();
    const coworker = await createTestUser(f.org.id, "MANAGER", "pilot-coworker");
    await expect(cancelUnusedPilotRoot(f.org.id, coworker.id, row.id)).rejects.toThrow(/encontrada/);
    await prisma.user.update({ where: { id: f.user.id }, data: { role: "VIEWER" } });
    await expect(reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW)).rejects.toThrow(/autorizado/);
    await expect(configurePilotBudget(f.org.id, f.user.id, false, 1)).rejects.toThrow(/autorizado/);
    await prisma.user.update({ where: { id: f.admin.id }, data: { isActive: false } });
    await expect(configurePilotBudget(f.org.id, f.admin.id, false, 1)).rejects.toThrow(/autorizado/);
  });
  it("shares the tenant lock with concurrent legacy calls", async () => {
    const f = await fixture(); await prisma.aiBudgetSetting.update({ where: { organizationId: f.org.id }, data: { monthlyBudgetMxn: 1 } });
    const usage = await prisma.aiUsage.create({ data: { organizationId: f.org.id, requestId: randomUUID(), provider: "fixture", model: "fixture", operation: "draft", origin: "webchat", createdAt: NOW } });
    const { Prisma } = await import("@prisma/client");
    const outcomes = await Promise.allSettled([reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW), reserveBudget(f.org.id, usage.id, { provider: "fixture", model: "fixture", costMxn: new Prisma.Decimal("0.75") }, null, NOW)]);
    const pilot = outcomes[0], legacy = outcomes[1];
    expect(legacy.status).toBe("fulfilled");
    if (legacy.status === "fulfilled") expect(Number(pilot.status === "fulfilled") + Number("ok" in legacy.value && legacy.value.ok)).toBe(1);
    expect((await getBudgetState(f.org.id, NOW)).reservedMxn).toBeLessThanOrEqual(1);
  });
  it("enforces financial checks in SQL and rejects suspended modules before reservation", async () => {
    const f = await fixture(), row = await reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW);
    await expect(prisma.aiPilotBudgetRoot.update({ where: { id: row.id }, data: { holdMxn: -1 } })).rejects.toThrow();
    await expect(prisma.aiPilotBudgetPolicy.update({ where: { organizationId: f.org.id }, data: { dailyMxn: 26 } })).rejects.toThrow();
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: f.org.id, module: "AI_WHATSAPP" } }, data: { status: "SUSPENDED" } });
    await expect(reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW)).rejects.toThrow(/autorizado/);
  });
  it("requires opt-in, checks policy version and does not forget holds on pause", async () => {
    const f = await fixture(), row = await reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW);
    await expect(configurePilotBudget(f.org.id, f.admin.id, false, 0)).rejects.toThrow(/cambió/);
    await configurePilotBudget(f.org.id, f.admin.id, false, 1);
    await expect(reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW)).rejects.toThrow(/desactivado/);
    expect((await getBudgetState(f.org.id, NOW)).reservedMxn).toBe(1);
    await cancelUnusedPilotRoot(f.org.id, f.user.id, row.id);
    expect((await getBudgetState(f.org.id, NOW)).reservedMxn).toBe(0);
    vi.stubEnv("AI_MARK_PILOT_BUDGET_ENABLED", "false");
    await expect(reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW)).rejects.toThrow(/habilitado/);
  });
  it("rejects duplicate dispatch and retains in-flight/ambiguous reservations indefinitely", async () => {
    const f = await fixture(), row = await reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW);
    await beginPilotRoot(f.org.id, f.user.id, row.id, NOW);
    await expect(beginPilotRoot(f.org.id, f.user.id, row.id, NOW)).rejects.toThrow();
    await expect(cancelUnusedPilotRoot(f.org.id, f.user.id, row.id)).rejects.toThrow(/conciliación/);
    expect((await getBudgetState(f.org.id, new Date("2026-12-25Z"))).reservedMxn).toBe(1);
  });
  it("counts today's spend and prevents dispatch after midnight, timezone or policy changes", async () => {
    const f = await fixture(), row = await reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW);
    await expect(beginPilotRoot(f.org.id, f.user.id, row.id, row.dayEnd)).rejects.toThrow();
    await prisma.organization.update({ where: { id: f.org.id }, data: { timezone: "UTC" } });
    await expect(beginPilotRoot(f.org.id, f.user.id, row.id, NOW)).rejects.toThrow();
    await prisma.organization.update({ where: { id: f.org.id }, data: { timezone: row.timezone } });
    await configurePilotBudget(f.org.id, f.admin.id, true, 1);
    await expect(beginPilotRoot(f.org.id, f.user.id, row.id, NOW)).rejects.toThrow();
    await prisma.aiUsage.create({ data: { organizationId: f.org.id, agentKey: PILOT_LIMITS.agentKey, requestId: randomUUID(), provider: "fixture", model: "fixture", operation: "probe", origin: "webchat", status: "SUCCEEDED", costMxn: 24, createdAt: NOW } });
    await expect(reservePilotRoot(f.org.id, f.user.id, randomUUID(), NOW)).rejects.toThrow(/agotado/);
  });
  it.each([["2026-03-08T12:00Z", 23], ["2026-11-01T12:00Z", 25]])("honors calendar DST days at %s", (date, hours) => {
    const day = budgetDay("America/New_York", new Date(date)); expect((day.end.getTime() - day.start.getTime()) / 3600000).toBe(hours);
  });
});
