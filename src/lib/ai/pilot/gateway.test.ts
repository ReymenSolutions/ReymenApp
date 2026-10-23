// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { getBudgetState } from "../budget";
import { runAiCall } from "../gateway";
import { reservePilotRoot, configurePilotBudget, beginPilotRoot } from "./budget";
import { runPilotAiCall, closePilotRoot, reconcilePilotCall, type PilotCallContext } from "./gateway";
import { PRIVATE_MARK_DEFINITION } from "./definition";

const mocks = vi.hoisted(() => ({ call: vi.fn(), fx: vi.fn() }));
vi.mock("../providers/anthropic-pilot", () => ({ callAnthropicPilot: mocks.call }));
vi.mock("@/lib/exchange-rate", () => ({ getMxnPerUsdRate: mocks.fx }));
const orgs: string[] = [], admins: string[] = [];
const input = { system: "Synthetic instructions", messages: [{ role: "user" as const, content: "Synthetic question" }], maxOutputTokens: 64 };
const usage = { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 };
const model = "claude-pilot-fixture-20260101";
const response = () => ({ text: "Synthetic response", modelServed: model, usage, externalId: `msg_${randomUUID()}` });
const evidence = (over = {}) => ({ kind: "PROVIDER_USAGE" as const, reference: `receipt-${randomUUID()}`, externalId: `msg_${randomUUID()}`, modelServed: model, usage, outcome: "SUCCEEDED" as const, ...over });
async function fixture() {
  const org = await createTestOrg("Pilot gateway fixture"); orgs.push(org.id);
  const owner = await createTestUser(org.id, "OWNER", "pilot-gateway-owner");
  const admin = await createTestUser(null, "SUPER_ADMIN", "pilot-gateway-admin"); admins.push(admin.id);
  await prisma.aiBudgetSetting.create({ data: { organizationId: org.id, monthlyBudgetMxn: 100 } });
  await configurePilotBudget(org.id, admin.id, true, 0);
  await prisma.agentDefinition.upsert({ where: { key_version: { key: "mark", version: 1 } }, update: {}, create: PRIVATE_MARK_DEFINITION });
  const instance = await prisma.agentInstance.create({ data: { organizationId: org.id, definitionKey: "mark", definitionVersion: 1, publicName: "Fixture Mark", status: "PAUSED", revisions: { create: { version: 1, sourceHash: "fixture", snapshot: {} } } } });
  const root = await reservePilotRoot(org.id, owner.id, randomUUID());
  await beginPilotRoot(org.id, owner.id, root.id);
  const ctx: PilotCallContext = { organizationId: org.id, actorId: owner.id, rootId: root.id, agentInstanceId: instance.id, configVersion: 1, step: 1 };
  return { org, owner, admin, root, instance, ctx };
}
beforeEach(async () => {
  vi.stubEnv("REYMEN_STAGING", "true");
  vi.stubEnv("AI_MARK_PILOT_GATEWAY_ENABLED", "true"); vi.stubEnv("AI_MARK_PILOT_BUDGET_ENABLED", "true");
  vi.stubEnv("AI_MARK_PILOT_MODEL", model); vi.stubEnv("AI_MARK_PILOT_ANTHROPIC_API_KEY", "fixture-not-a-real-key");
  mocks.call.mockReset().mockImplementation(async () => response());
  mocks.fx.mockReset().mockResolvedValue({ rate: 20, source: "env", date: null });
  await prisma.aiRate.create({ data: { provider: "anthropic", model, currency: "MXN", inputPerMTok: 100, outputPerMTok: 1000, effectiveFrom: new Date("2020-01-01Z"), source: "test-pilot-gateway" } });
});
afterEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
  for (const id of orgs.splice(0)) {
    await prisma.aiUsage.deleteMany({ where: { organizationId: id } });
    await prisma.aiPilotBudgetRoot.deleteMany({ where: { organizationId: id } });
    await prisma.agentConfigRevision.deleteMany({ where: { organizationId: id } });
    await prisma.agentInstance.deleteMany({ where: { organizationId: id } });
    await cleanupOrg(id);
  }
  // Shared immutable catalog metadata stays for the disposable test database's lifetime,
  // just like legacy-assistant, so another test file's instance is never removed.
  await prisma.user.deleteMany({ where: { id: { in: admins.splice(0) } } });
  await prisma.aiRate.deleteMany({ where: { source: "test-pilot-gateway" } });
});

describe("durable private pilot financial gateway", () => {
  it("snapshots USD conversion through the fixed private FX endpoint before provider dispatch", async () => {
    const f = await fixture(); vi.stubEnv("AI_MARK_PILOT_PROXY_URL", "http://ingress:8081");
    await prisma.aiRate.updateMany({ where: { source: "test-pilot-gateway" }, data: { currency: "USD", inputPerMTok: 2, outputPerMTok: 10 } });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ date: "2026-10-21", rates: { MXN: 20 } }), { status: 200 })); vi.stubGlobal("fetch", fetchMock);
    await runPilotAiCall(f.ctx, input);
    expect(fetchMock).toHaveBeenCalledWith("http://ingress:8081/fx", expect.objectContaining({ cache: "no-store" }));
    const row = await prisma.aiUsage.findFirstOrThrow({ where: { organizationId: f.org.id } });
    expect(Number(row.fxRate)).toBe(20); expect(row.fxSource).toBe("frankfurter"); expect(Number(row.costMxn)).toBe(0.0044);
  });
  it("missing or invalid private FX blocks before creating a claim or charging the provider", async () => {
    const f = await fixture(); vi.stubEnv("AI_MARK_PILOT_PROXY_URL", "http://ingress:8081");
    await prisma.aiRate.updateMany({ where: { source: "test-pilot-gateway" }, data: { currency: "USD", inputPerMTok: 2, outputPerMTok: 10 } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ date: "2026-10-21", rates: { MXN: -1 } }), { status: 200 })));
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/no_fx/);
    expect(await prisma.aiUsage.count({ where: { organizationId: f.org.id } })).toBe(0); expect(mocks.call).not.toHaveBeenCalled();
  });
  it("never follows an arbitrary private FX proxy URL", async () => {
    const f = await fixture(); vi.stubEnv("AI_MARK_PILOT_PROXY_URL", "http://untrusted-host");
    await prisma.aiRate.updateMany({ where: { source: "test-pilot-gateway" }, data: { currency: "USD" } });
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/proxy_invalid/);
    expect(fetchMock).not.toHaveBeenCalled(); expect(mocks.call).not.toHaveBeenCalled();
  });
  it("attributes two calls to a tenant/root/config/step, settles actual cost once and releases only unused capacity", async () => {
    const f = await fixture();
    await runPilotAiCall(f.ctx, input);
    const state = await getBudgetState(f.org.id);
    expect(state.spentMxn).toBe(0.021); expect(state.reservedMxn).toBe(0.979);
    await runPilotAiCall({ ...f.ctx, step: 2 }, input);
    const rows = await prisma.aiUsage.findMany({ where: { organizationId: f.org.id }, orderBy: { pilotStep: "asc" }, include: { pilotRoot: true } });
    expect(rows.map(v => v.pilotStep)).toEqual([1, 2]);
    expect(rows.every(v => v.pilotRoot?.agentInstanceId === f.instance.id && v.pilotRoot.configVersion === 1 && v.costMxn?.equals("0.021"))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("Synthetic question");
    expect(await prisma.aiBudgetReservation.count({ where: { organizationId: f.org.id } })).toBe(0);
    await closePilotRoot(f.org.id, f.owner.id, f.root.id);
    expect((await getBudgetState(f.org.id)).reservedMxn).toBe(0);
    expect((await getBudgetState(f.org.id)).spentMxn).toBe(0.042);
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/dispatchable/);
  });
  it("allows only one concurrent dispatch per step and blocks a second step while the first is unresolved", async () => {
    const f = await fixture();
    let release!: (result: ReturnType<typeof response>) => void;
    let entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; });
    mocks.call.mockImplementationOnce(() => { entered(); return new Promise(resolve => { release = resolve; }); });
    const first = runPilotAiCall(f.ctx, input); await ready;
    const duplicates = await Promise.allSettled(Array.from({ length: 5 }, () => runPilotAiCall(f.ctx, input)));
    expect(duplicates.every(v => v.status === "rejected")).toBe(true);
    await expect(runPilotAiCall({ ...f.ctx, step: 2 }, input)).rejects.toThrow(/order/);
    release(response()); await first; expect(mocks.call).toHaveBeenCalledTimes(1);
  });
  it("retains an ambiguous call indefinitely, even with flags off or in a later cycle, and never records a free failure", async () => {
    const f = await fixture(); mocks.call.mockRejectedValueOnce(new Error("timeout with secret fixture-token"));
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow("pilot_outcome_uncertain");
    const row = await prisma.aiUsage.findFirstOrThrow({ where: { pilotRootId: f.root.id } });
    expect(row).toMatchObject({ status: "PENDING", costMxn: null, errorCode: "PROVIDER_OUTCOME_UNCERTAIN" });
    expect(JSON.stringify(row)).not.toContain("fixture-token");
    expect((await prisma.aiPilotBudgetPolicy.findUniqueOrThrow({ where: { organizationId: f.org.id } })).enabled).toBe(false);
    vi.stubEnv("AI_MARK_PILOT_BUDGET_ENABLED", "false"); vi.stubEnv("AI_MARK_PILOT_GATEWAY_ENABLED", "false");
    expect((await getBudgetState(f.org.id, new Date("2030-01-01Z"))).reservedMxn).toBe(1);
    await expect(closePilotRoot(f.org.id, f.owner.id, f.root.id)).rejects.toThrow(/reconciliation/);
  });
  it("requires a fresh platform admin and scoped evidence to reconcile; repeat reconciliation has no financial effect", async () => {
    const f = await fixture(), other = await fixture(); mocks.call.mockRejectedValueOnce(new Error("uncertain"));
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow();
    const row = await prisma.aiUsage.findFirstOrThrow({ where: { pilotRootId: f.root.id } });
    await expect(reconcilePilotCall(f.org.id, f.owner.id, row.id, evidence())).rejects.toThrow(/forbidden/);
    await expect(reconcilePilotCall(other.org.id, f.admin.id, row.id, evidence())).rejects.toThrow(/pending/);
    await prisma.user.update({ where: { id: f.admin.id }, data: { isActive: false } });
    await expect(reconcilePilotCall(f.org.id, f.admin.id, row.id, evidence())).rejects.toThrow(/forbidden/);
    await prisma.user.update({ where: { id: f.admin.id }, data: { isActive: true } });
    vi.stubEnv("AI_MARK_PILOT_GATEWAY_ENABLED", "false");
    const proof = evidence(); const saved = await reconcilePilotCall(f.org.id, f.admin.id, row.id, proof);
    expect(saved.costBasis).toBe("ESTIMATED"); expect(saved.costMxn?.toString()).toBe("0.021");
    await expect(reconcilePilotCall(f.org.id, f.admin.id, row.id, proof)).rejects.toThrow(/pending/);
    expect(await prisma.auditLog.count({ where: { resourceId: row.id, action: "ai.pilot_usage.reconcile" } })).toBe(1);
    await closePilotRoot(f.org.id, f.admin.id, f.root.id);
    expect((await getBudgetState(f.org.id)).reservedMxn).toBe(0);
  });
  it("releases an uncertain no-charge failure only with reviewed provider no-charge evidence", async () => {
    const f = await fixture(); mocks.call.mockRejectedValueOnce(new Error("unknown"));
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow();
    const row = await prisma.aiUsage.findFirstOrThrow({ where: { pilotRootId: f.root.id } });
    const proof = evidence({ kind: "PROVIDER_NO_CHARGE" as const, outcome: "FAILED" as const, externalId: `req_${randomUUID()}`, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 } });
    await expect(reconcilePilotCall(f.org.id, f.admin.id, row.id, { ...proof, usage })).rejects.toThrow(/no_charge/);
    expect((await reconcilePilotCall(f.org.id, f.admin.id, row.id, proof)).costMxn?.toString()).toBe("0");
    await closePilotRoot(f.org.id, f.admin.id, f.root.id);
    expect((await getBudgetState(f.org.id)).reservedMxn).toBe(0);
  });
  it("rejects foreign tenants, revoked permissions, changed config and disabled flags before dispatch", async () => {
    const f = await fixture(), other = await fixture();
    await expect(runPilotAiCall({ ...f.ctx, organizationId: other.org.id, actorId: other.owner.id }, input)).rejects.toThrow(/dispatchable/);
    await expect(runPilotAiCall({ ...f.ctx, agentInstanceId: other.instance.id }, input)).rejects.toThrow(/config/);
    await prisma.user.update({ where: { id: f.owner.id }, data: { role: "VIEWER" } });
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/autorizado/);
    await prisma.user.update({ where: { id: f.owner.id }, data: { role: "OWNER" } });
    await prisma.agentInstance.update({ where: { id: f.instance.id }, data: { status: "LEGACY" } });
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/config/);
    await prisma.agentInstance.update({ where: { id: f.instance.id }, data: { status: "PAUSED" } });
    await prisma.agentInstance.update({ where: { id: f.instance.id }, data: { configVersion: 2 } });
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/config/);
    vi.stubEnv("REYMEN_STAGING", "false");
    await expect(runPilotAiCall(other.ctx, input)).rejects.toThrow(/requires_staging/);
    vi.stubEnv("REYMEN_STAGING", "true");
    vi.stubEnv("AI_MARK_PILOT_GATEWAY_ENABLED", "false");
    await expect(runPilotAiCall(other.ctx, input)).rejects.toThrow(/disabled/);
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("blocks estimates above the root, global reductions and missing tariffs/FX before calling", async () => {
    const f = await fixture();
    await prisma.aiRate.updateMany({ where: { source: "test-pilot-gateway" }, data: { inputPerMTok: 1000000 } });
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/budget/);
    await prisma.aiRate.updateMany({ where: { source: "test-pilot-gateway" }, data: { inputPerMTok: 100, currency: "USD" } });
    mocks.fx.mockResolvedValueOnce(null);
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/no_fx/);
    await prisma.aiBudgetSetting.update({ where: { organizationId: f.org.id }, data: { monthlyBudgetMxn: 0.5 } });
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/budget_changed/);
    await prisma.aiBudgetSetting.update({ where: { organizationId: f.org.id }, data: { monthlyBudgetMxn: 100 } });
    vi.stubEnv("AI_MARK_PILOT_MODEL", "unpriced-fixture");
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/no_rate/);
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("does not fall back when Anthropic returns another model, malformed usage or a repeated provider receipt", async () => {
    const f = await fixture(); mocks.call.mockResolvedValueOnce({ ...response(), modelServed: "different-model" });
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/uncertain/);
    const other = await fixture(); const result = response(); mocks.call.mockResolvedValue(result);
    await runPilotAiCall(other.ctx, input);
    await expect(runPilotAiCall({ ...other.ctx, step: 2 }, input)).rejects.toThrow(/uncertain/);
    expect(await prisma.aiUsage.count({ where: { pilotRootId: other.root.id, status: "SUCCEEDED" } })).toBe(1);
    expect((await prisma.aiPilotBudgetRoot.findUniqueOrThrow({ where: { id: other.root.id } })).state).toBe("UNCERTAIN");
  });
  it("pins tariff and FX at admission and records refusals as chargeable", async () => {
    const f = await fixture(); await prisma.aiRate.updateMany({ where: { source: "test-pilot-gateway" }, data: { currency: "USD", inputPerMTok: 1, outputPerMTok: 10 } });
    mocks.call.mockImplementationOnce(async () => {
      mocks.fx.mockResolvedValue({ rate: 100, source: "env", date: null });
      await prisma.aiRate.create({ data: { provider: "anthropic", model, currency: "USD", inputPerMTok: 1000, outputPerMTok: 1000, effectiveFrom: new Date(), source: "test-pilot-gateway" } });
      return { ...response(), refused: true };
    });
    await runPilotAiCall(f.ctx, input);
    const row = await prisma.aiUsage.findFirstOrThrow({ where: { pilotRootId: f.root.id } });
    expect(row.status).toBe("REFUSED"); expect(row.fxRate?.toString()).toBe("20"); expect(row.costMxn?.toString()).toBe("0.0042");
  });
  it("retains the ledger and hold atomically when settlement persistence fails", async () => {
    const f = await fixture();
    const transact = prisma.$transaction.bind(prisma) as (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => Promise<unknown>;
    vi.spyOn(prisma, "$transaction").mockImplementation(((work: (tx: Prisma.TransactionClient) => Promise<unknown>) => transact(async tx => work(new Proxy(tx, { get(target, property) {
      if (property !== "aiPilotBudgetRoot") return Reflect.get(target, property);
      return new Proxy(target.aiPilotBudgetRoot, { get(delegate, method) {
        if (method === "update") return async (args: Parameters<typeof delegate.update>[0]) => {
          if (args.data.holdMxn !== undefined) throw new Error("fixture-settlement-failure");
          return delegate.update(args);
        };
        return Reflect.get(delegate, method);
      } });
    } })))) as typeof prisma.$transaction);
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/uncertain/);
    const row = await prisma.aiUsage.findFirstOrThrow({ where: { pilotRootId: f.root.id } });
    expect(row.status).toBe("PENDING"); expect(row.costMxn).toBeNull();
    expect((await getBudgetState(f.org.id)).reservedMxn).toBe(1);
  });
  it("records reviewed provider usage overruns honestly instead of hiding or clamping incurred costs", async () => {
    const f = await fixture(); mocks.call.mockResolvedValueOnce({ ...response(), usage: { ...usage, outputTokens: 2000 } });
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/uncertain/);
    const row = await prisma.aiUsage.findFirstOrThrow({ where: { pilotRootId: f.root.id } });
    const saved = await reconcilePilotCall(f.org.id, f.admin.id, row.id, evidence({ usage: { ...usage, outputTokens: 2000 } }));
    expect(saved.errorCode).toBe("PILOT_COST_OVERRUN"); expect(saved.costMxn?.toString()).toBe("2.001");
    expect((await getBudgetState(f.org.id)).spentMxn).toBe(2.001);
  });
  it("cannot bypass the root admission by sending mark:pilot through the legacy gateway", async () => {
    const f = await fixture();
    await expect(runAiCall({ organizationId: f.org.id, agentKey: "mark:pilot", operation: "probe", origin: "webchat" }, input)).rejects.toThrow(/durable_gateway/);
    expect(mocks.call).not.toHaveBeenCalled();
  });
  it("enforces the remaining per-root budget before a second call", async () => {
    const f = await fixture(); mocks.call.mockResolvedValueOnce({ ...response(), usage: { ...usage, outputTokens: 500 } });
    await runPilotAiCall(f.ctx, { ...input, maxOutputTokens: 512 });
    await expect(runPilotAiCall({ ...f.ctx, step: 2 }, { ...input, maxOutputTokens: 512 })).rejects.toThrow(/budget_exhausted/);
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });
  it("keeps malformed token usage unknown and cannot dispatch after module revocation", async () => {
    const f = await fixture(); mocks.call.mockResolvedValueOnce({ ...response(), usage: { ...usage, inputTokens: -1 } });
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/uncertain/);
    expect((await getBudgetState(f.org.id)).reservedMxn).toBe(1);
    const other = await fixture();
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: other.org.id, module: "AI_WHATSAPP" } }, data: { status: "SUSPENDED" } });
    await expect(runPilotAiCall(other.ctx, input)).rejects.toThrow(/autorizado/);
    expect(mocks.call).toHaveBeenCalledTimes(1);
  });
  it("settles an already admitted result after flags are switched off without losing its charge", async () => {
    const f = await fixture();
    mocks.call.mockImplementationOnce(async () => {
      vi.stubEnv("AI_MARK_PILOT_GATEWAY_ENABLED", "false");
      vi.stubEnv("AI_MARK_PILOT_BUDGET_ENABLED", "false");
      return response();
    });
    await runPilotAiCall(f.ctx, input);
    await closePilotRoot(f.org.id, f.admin.id, f.root.id);
    expect((await getBudgetState(f.org.id)).spentMxn).toBe(0.021);
    expect((await getBudgetState(f.org.id)).reservedMxn).toBe(0);
  });
  it("can reconcile the actual served model only with its historical tariff and matching currency", async () => {
    const f = await fixture(), served = "provider-other-fixture";
    mocks.call.mockResolvedValueOnce({ ...response(), modelServed: served });
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/uncertain/);
    const row = await prisma.aiUsage.findFirstOrThrow({ where: { pilotRootId: f.root.id } });
    await expect(reconcilePilotCall(f.org.id, f.admin.id, row.id, evidence({ modelServed: served }))).rejects.toThrow(/snapshot_missing/);
    await prisma.aiRate.create({ data: { provider: "anthropic", model: served, currency: "USD", inputPerMTok: 100, outputPerMTok: 100, effectiveFrom: new Date("2020-01-01Z"), source: "test-pilot-gateway" } });
    await expect(reconcilePilotCall(f.org.id, f.admin.id, row.id, evidence({ modelServed: served }))).rejects.toThrow(/currency_mismatch/);
    await prisma.aiRate.create({ data: { provider: "anthropic", model: served, currency: "MXN", inputPerMTok: 100, outputPerMTok: 100, effectiveFrom: new Date("2021-01-01Z"), source: "test-pilot-gateway" } });
    const saved = await reconcilePilotCall(f.org.id, f.admin.id, row.id, evidence({ modelServed: served }));
    expect(saved.model).toBe(model); expect(saved.modelServed).toBe(served); expect(saved.costMxn?.toString()).toBe("0.003");
  });
  it("does not treat pre-existing FAILED rows without cost as free or release their root", async () => {
    const f = await fixture();
    await prisma.aiUsage.create({ data: { organizationId: f.org.id, pilotRootId: f.root.id, agentKey: "mark:pilot", requestId: randomUUID(), operation: "probe", origin: "webchat", provider: "anthropic", model, status: "FAILED" } });
    await expect(closePilotRoot(f.org.id, f.admin.id, f.root.id)).rejects.toThrow(/reconciliation/);
    await expect(runPilotAiCall(f.ctx, input)).rejects.toThrow(/order/);
    expect(mocks.call).not.toHaveBeenCalled();
  });
});
