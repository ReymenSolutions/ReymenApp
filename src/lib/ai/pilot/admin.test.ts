// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { preparePrivateMark, getPrivatePilotAdmin } from "./admin";
import { PRIVATE_MARK_CONFIG, PRIVATE_MARK_DEFINITION, pilotConfigHash } from "./definition";
import { beginPilotRoot, configurePilotBudget, reservePilotRoot } from "./budget";
import { preparePrivateMarkAction, closePrivateMarkRootAction, reconcilePrivateMarkAction } from "@/actions/mark-pilot-admin";

const mocks = vi.hoisted(() => ({ session: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireAdmin: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
const orgs: string[] = [], admins: string[] = [];
async function fixture() {
  const org = await createTestOrg("Private admin fixture"); orgs.push(org.id);
  const admin = await createTestUser(null, "SUPER_ADMIN", "private-admin"); admins.push(admin.id);
  const owner = await createTestUser(org.id, "OWNER", "private-owner");
  mocks.session.mockResolvedValue({ user: { id: admin.id, role: "SUPER_ADMIN" } });
  return { org, admin, owner };
}
beforeEach(() => { vi.stubEnv("REYMEN_STAGING", "true"); vi.stubEnv("AI_MARK_PILOT_BUDGET_ENABLED", "true"); mocks.session.mockReset(); mocks.revalidate.mockReset(); });
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const organizationId of orgs.splice(0)) {
    await prisma.aiUsage.deleteMany({ where: { organizationId } });
    await prisma.aiPilotBudgetRoot.deleteMany({ where: { organizationId } });
    await prisma.agentConfigRevision.deleteMany({ where: { organizationId } });
    await prisma.agentInstance.deleteMany({ where: { organizationId } });
    await cleanupOrg(organizationId);
  }
  await prisma.user.deleteMany({ where: { id: { in: admins.splice(0) } } });
  await prisma.aiRate.deleteMany({ where: { source: "test-private-admin" } });
  await prisma.agentDefinition.updateMany({ where: { key: "mark", version: 1 }, data: { manifest: PRIVATE_MARK_DEFINITION.manifest } });
});

describe("private pilot administrative preparation", () => {
  it("creates only a paused, review-only instance and disabled budget without provider/channel effects", async () => {
    const f = await fixture();
    const result = await preparePrivateMark(f.org.id, f.admin.id);
    const instance = await prisma.agentInstance.findUniqueOrThrow({ where: { id: result.instanceId }, include: { revisions: true, channelRoutes: true } });
    expect(instance.status).toBe("PAUSED"); expect(instance.legacyAssistantId).toBeNull(); expect(instance.channelRoutes).toEqual([]);
    expect(instance.revisions[0].snapshot).toEqual(PRIVATE_MARK_CONFIG);
    expect(instance.revisions[0].sourceHash).toBe(pilotConfigHash(PRIVATE_MARK_CONFIG));
    expect((await prisma.aiPilotBudgetPolicy.findUniqueOrThrow({ where: { organizationId: f.org.id } })).enabled).toBe(false);
    expect(await prisma.aiUsage.count({ where: { organizationId: f.org.id } })).toBe(0);
    expect(await prisma.channelConnection.count({ where: { organizationId: f.org.id } })).toBe(0);
  });
  it("deduplicates concurrent preparation and audits only actual creation", async () => {
    const f = await fixture();
    const results = await Promise.all(Array.from({ length: 5 }, () => preparePrivateMark(f.org.id, f.admin.id)));
    expect(new Set(results.map(v => v.instanceId)).size).toBe(1);
    expect(results.filter(v => v.created)).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { organizationId: f.org.id, action: "ai.private_pilot.prepare" } })).toBe(1);
  });
  it("never overwrites an authorized budget or changed instance configuration", async () => {
    const f = await fixture(); const result = await preparePrivateMark(f.org.id, f.admin.id);
    await configurePilotBudget(f.org.id, f.admin.id, true, 1);
    await preparePrivateMark(f.org.id, f.admin.id);
    expect((await prisma.aiPilotBudgetPolicy.findUniqueOrThrow({ where: { organizationId: f.org.id } })).enabled).toBe(true);
    await prisma.agentInstance.update({ where: { id: result.instanceId }, data: { status: "LEGACY" } });
    await expect(preparePrivateMark(f.org.id, f.admin.id)).rejects.toThrow(/configuration_conflict/);
    expect((await prisma.agentInstance.findUniqueOrThrow({ where: { id: result.instanceId } })).status).toBe("LEGACY");
  });
  it("rejects stale/non-platform sessions, inactive admins, missing modules and production", async () => {
    const f = await fixture();
    await expect(preparePrivateMark(f.org.id, f.owner.id)).rejects.toThrow(/forbidden/);
    await expect(getPrivatePilotAdmin(f.owner.id, f.org.id)).rejects.toThrow(/forbidden/);
    await prisma.user.update({ where: { id: f.admin.id }, data: { isActive: false } });
    await expect(preparePrivateMarkAction({ organizationId: f.org.id })).rejects.toThrow(/forbidden/);
    await prisma.user.update({ where: { id: f.admin.id }, data: { isActive: true } });
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: f.org.id, module: "AI_WHATSAPP" } }, data: { status: "SUSPENDED" } });
    await expect(preparePrivateMark(f.org.id, f.admin.id)).rejects.toThrow(/unavailable/);
    vi.stubEnv("REYMEN_STAGING", "false");
    await expect(preparePrivateMarkAction({ organizationId: f.org.id })).rejects.toThrow(/requires_staging/);
    expect(await prisma.agentInstance.count({ where: { organizationId: f.org.id } })).toBe(0);
  });
  it("refuses unknown organizations and exposes only selected-tenant financial metadata", async () => {
    const f = await fixture(), other = await fixture();
    await preparePrivateMark(f.org.id, f.admin.id);
    await expect(preparePrivateMark(randomUUID(), f.admin.id)).rejects.toThrow(/unavailable/);
    const result = await getPrivatePilotAdmin(f.admin.id, f.org.id);
    expect(result.organization?.id).toBe(f.org.id);
    expect(result.instance?.id).toBeTruthy();
    expect((await getPrivatePilotAdmin(f.admin.id, other.org.id)).instance).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/passwordHash|n8nWebhookSecret|snapshot|prompt|phone/i);
  });
  it("does not accept an extra client-supplied actor or confirmation-free reconciliation", async () => {
    const f = await fixture();
    await expect(preparePrivateMarkAction({ organizationId: f.org.id, actorId: f.admin.id } as never)).rejects.toThrow();
    await expect(reconcilePrivateMarkAction({ organizationId: f.org.id, usageId: "unknown", confirmEvidence: false, evidence: { kind: "PROVIDER_NO_CHARGE", reference: "reviewed-receipt", externalId: "req_fixture", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }, outcome: "FAILED" } })).rejects.toThrow();
    expect(await prisma.auditLog.count({ where: { organizationId: f.org.id } })).toBe(0);
  });
  it("the admin close action cannot fall back to owner permissions from a stale admin session", async () => {
    const f = await fixture(); await preparePrivateMark(f.org.id, f.admin.id);
    await configurePilotBudget(f.org.id, f.admin.id, true, 1);
    const root = await reservePilotRoot(f.org.id, f.owner.id, randomUUID()); await beginPilotRoot(f.org.id, f.owner.id, root.id);
    mocks.session.mockResolvedValue({ user: { id: f.owner.id, role: "SUPER_ADMIN" } });
    await expect(closePrivateMarkRootAction({ organizationId: f.org.id, rootId: root.id })).rejects.toThrow(/forbidden/);
    expect((await prisma.aiPilotBudgetRoot.findUniqueOrThrow({ where: { id: root.id } })).state).toBe("IN_FLIGHT");
  });
  it("audits reviewed no-charge evidence then permits an admin to close only that reconciled root", async () => {
    const f = await fixture(), prepared = await preparePrivateMark(f.org.id, f.admin.id);
    await configurePilotBudget(f.org.id, f.admin.id, true, 1);
    const root = await reservePilotRoot(f.org.id, f.owner.id, randomUUID()); await beginPilotRoot(f.org.id, f.owner.id, root.id);
    await prisma.aiPilotBudgetRoot.update({ where: { id: root.id }, data: { agentInstanceId: prepared.instanceId, configVersion: 1 } });
    const rate = await prisma.aiRate.create({ data: { provider: "anthropic", model: "admin-fixture", currency: "MXN", inputPerMTok: 1, outputPerMTok: 1, effectiveFrom: new Date("2020-01-01Z"), source: "test-private-admin" } });
    const row = await prisma.aiUsage.create({ data: { organizationId: f.org.id, pilotRootId: root.id, pilotStep: 1, pilotEstimateMxn: 1, pilotInputHash: "fixture", requestId: randomUUID(), agentKey: "mark:pilot", provider: "anthropic", model: "admin-fixture", operation: "pilot_probe", origin: "webchat", rateId: rate.id, currencyOriginal: "MXN" } });
    const view = await getPrivatePilotAdmin(f.admin.id, f.org.id);
    expect(view.pendingCount).toBe(1); expect(view.pending[0].id).toBe(row.id);
    await expect(closePrivateMarkRootAction({ organizationId: f.org.id, rootId: root.id })).rejects.toThrow(/reconciliation/);
    await reconcilePrivateMarkAction({ organizationId: f.org.id, usageId: row.id, confirmEvidence: true, evidence: { kind: "PROVIDER_NO_CHARGE", reference: "provider-confirmed-receipt", externalId: `req_${randomUUID()}`, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 }, outcome: "FAILED" } });
    await closePrivateMarkRootAction({ organizationId: f.org.id, rootId: root.id });
    expect((await prisma.aiPilotBudgetRoot.findUniqueOrThrow({ where: { id: root.id } })).holdMxn.toString()).toBe("0");
    expect(await prisma.auditLog.count({ where: { organizationId: f.org.id, action: "ai.pilot_usage.reconcile" } })).toBe(1);
  });
});
