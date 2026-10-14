// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg, fakeSession } from "@/test/helpers";
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
const actions = await import("./loyalty");
const program = { name: "Club", visitGoal: 2, rewardType: "FREE_ITEM" as const, rewardName: "Café", status: "ACTIVE" as const };

describe("loyalty server action authorization", () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let owner: Awaited<ReturnType<typeof createTestUser>>;
  beforeAll(async () => { org = await createTestOrg("Loyalty guards"); owner = await createTestUser(org.id, "OWNER", "loyalty-guard"); });
  afterAll(async () => cleanupOrg(org.id));
  it("requires authentication and entitlement for reads, writes and recovery", async () => {
    authMock.mockResolvedValue(null);
    await expect(actions.saveLoyaltyProgram(program)).rejects.toThrow(/autorizado/);
    authMock.mockResolvedValue(fakeSession(owner));
    await expect(actions.saveLoyaltyProgram(program)).rejects.toThrow(/habilitado/);
    await expect(actions.searchLoyaltyMembers("Ana")).rejects.toThrow(/habilitado/);
    await expect(actions.retryLoyaltyEvents()).rejects.toThrow(/habilitado/);
  });
  it("owner configures; viewer cannot mutate; cashier operates but cannot configure or recover events", async () => {
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "LOYALTY" } });
    authMock.mockResolvedValue(fakeSession(owner));
    expect((await actions.saveLoyaltyProgram(program)).created).toBe(true);
    authMock.mockResolvedValue(fakeSession({ ...owner, role: "VIEWER" }));
    await expect(actions.registerLoyaltyVisit({ memberId: "x", idempotencyKey: "arbitrary-client-key" })).rejects.toThrow(/autorizado/);
    await expect(actions.redeemLoyaltyReward({ rewardId: "x" })).rejects.toThrow(/autorizado/);
    await expect(actions.reconcileLoyalty("x")).rejects.toThrow(/autorizado/);
    authMock.mockResolvedValue(fakeSession({ ...owner, role: "AGENT" }));
    await expect(actions.saveLoyaltyProgram(program)).rejects.toThrow(/autorizado/);
    await expect(actions.retryLoyaltyEvents()).rejects.toThrow(/autorizado/);
    expect(await actions.searchLoyaltyMembers("Ana")).toEqual([]);
  });
  it("suspension blocks existing sessions and preserves program history", async () => {
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "LOYALTY" } }, data: { status: "SUSPENDED" } });
    authMock.mockResolvedValue(fakeSession(owner));
    await expect(actions.redeemLoyaltyReward({ rewardId: "x" })).rejects.toThrow(/habilitado/);
    expect(await prisma.loyaltyProgram.count({ where: { organizationId: org.id } })).toBe(1);
  });
});
