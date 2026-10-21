// @vitest-environment node
import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";
import type { SandboxInput } from "./contract";
import * as fixtures from "./fixtures";
import { admitMarkSandbox, readMarkSandbox, executeMarkSandbox, cancelMarkSandbox, expireMarkSandboxRuns } from "./service";
const authMock = vi.fn(); vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));
const { startMarkSandbox, runMarkSandboxPreview, getMarkSandbox, stopMarkSandbox } = await import("@/actions/mark-sandbox");
const input: SandboxInput = { mode: "simulation", question: "horario", channel: "webchat", permissions: { knowledge: true, customer: false } };
const ids: string[] = [];
async function setup(role: "OWNER" | "MANAGER" = "OWNER") {
  const org = await createTestOrg("Phase5 sandbox fixture"); ids.push(org.id);
  const user = await createTestUser(org.id, role, "mark-fixture");
  authMock.mockResolvedValue(fakeSession({ id: user.id, role, organizationId: org.id }));
  return { org, user };
}
beforeEach(() => vi.stubEnv("AI_MARK_SANDBOX_ENABLED", "true"));
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const id of ids.splice(0)) await cleanupOrg(id); });
describe("Mark sandbox durable authorization and receipts", () => {
  it.each(["OWNER", "MANAGER"] as const)("lets %s run a fixture without changing customers, messages, sources or usage", async role => {
    const f = await setup(role), admitted = await startMarkSandbox(input, randomUUID());
    const result = await runMarkSandboxPreview(admitted.id, input);
    expect(result.status).toBe("SUCCEEDED"); expect(result.result).toMatchObject({ providerCalls: 0, externalEffects: 0, reads: 1 });
    for (const n of await Promise.all([prisma.customer.count({ where: { organizationId: f.org.id } }), prisma.conversation.count({ where: { organizationId: f.org.id } }), prisma.knowledgeBase.count({ where: { organizationId: f.org.id } }), prisma.aiUsage.count({ where: { organizationId: f.org.id } }), prisma.agentInstance.count({ where: { organizationId: f.org.id } })])) expect(n).toBe(0);
  });
  it.each(["AGENT", "VIEWER", "CLIENT"] as const)("denies %s direct start/execute/get/cancel with no sandbox writes", async role => {
    const f = await setup(); authMock.mockResolvedValue(fakeSession({ id: f.user.id, role, organizationId: f.org.id }));
    for (const call of [() => startMarkSandbox(input, randomUUID()), () => runMarkSandboxPreview("forged", input), () => getMarkSandbox("forged"), () => stopMarkSandbox("forged")]) await expect(call()).rejects.toThrow(/autorizado/);
    expect(await prisma.agentSandboxRun.count({ where: { organizationId: f.org.id } })).toBe(0);
  });
  it("denies anonymous calls without creating a durable record", async () => {
    authMock.mockResolvedValue(null);
    await expect(startMarkSandbox(input, randomUUID())).rejects.toThrow(/autorizado/);
    await expect(getMarkSandbox("forged")).rejects.toThrow(/autorizado/);
  });
  it("rejects foreign organization and actor IDs without revealing a receipt", async () => {
    const a = await setup(), row = await admitMarkSandbox(a.org.id, a.user.id, randomUUID(), input), b = await setup();
    await expect(getMarkSandbox(row.id)).rejects.toThrow("Prueba no encontrada");
    await expect(executeMarkSandbox(b.org.id, b.user.id, row.id, input)).rejects.toThrow("Prueba no encontrada");
    const second = await createTestUser(a.org.id, "MANAGER", "second-manager");
    await expect(readMarkSandbox(a.org.id, second.id, row.id)).rejects.toThrow("Prueba no encontrada");
    await expect(cancelMarkSandbox(b.org.id, b.user.id, row.id)).rejects.toThrow("Prueba no encontrada");
    expect((await prisma.agentSandboxRun.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("QUEUED");
  });
  it("serializes duplicate admission and rejects a reused key with different inputs", async () => {
    const f = await setup(), key = randomUUID();
    const rows = await Promise.all(Array.from({ length: 3 }, () => admitMarkSandbox(f.org.id, f.user.id, key, input)));
    expect(new Set(rows.map(r => r.id)).size).toBe(1);
    await expect(admitMarkSandbox(f.org.id, f.user.id, key, { ...input, question: "modified" })).rejects.toThrow(/cambió/);
    await expect(admitMarkSandbox(f.org.id, f.user.id, randomUUID(), input)).rejects.toThrow(/curso/);
    expect(await prisma.agentSandboxRun.count({ where: { organizationId: f.org.id } })).toBe(1);
  });
  it("claims once, replays completed receipts and never makes a third simulated call", async () => {
    const f = await setup(), row = await startMarkSandbox(input, randomUUID()), next = vi.spyOn(fixtures, "fixtureDecision");
    await Promise.all([executeMarkSandbox(f.org.id, f.user.id, row.id, input), executeMarkSandbox(f.org.id, f.user.id, row.id, input)]);
    const result = await executeMarkSandbox(f.org.id, f.user.id, row.id, input);
    expect(result.status).toBe("SUCCEEDED"); expect(next).toHaveBeenCalledTimes(2);
  });
  it("cancellation fences a late decision and preserves the cancelled durable row", async () => {
    const f = await setup(), row = await startMarkSandbox(input, randomUUID());
    let release!: () => void, entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; }), barrier = new Promise<void>(resolve => { release = resolve; });
    const original = fixtures.fixtureDecision;
    vi.spyOn(fixtures, "fixtureDecision").mockImplementationOnce(async context => { entered(); await barrier; return original(context); });
    const running = executeMarkSandbox(f.org.id, f.user.id, row.id, input); await started;
    await stopMarkSandbox(row.id); release();
    const result = await running; expect(result.status).toBe("CANCELLED"); expect(result.result).toBeNull();
    expect((await getMarkSandbox(row.id)).status).toBe("CANCELLED");
  });
  it("revokes authority before a tool if the operator is disabled during a simulated decision", async () => {
    const f = await setup(), row = await startMarkSandbox(input, randomUUID()), original = fixtures.fixtureDecision;
    vi.spyOn(fixtures, "fixtureDecision").mockImplementationOnce(async context => { await prisma.user.update({ where: { id: f.user.id }, data: { isActive: false } }); return original(context); });
    const result = await executeMarkSandbox(f.org.id, f.user.id, row.id, input);
    expect(result.status).toBe("CANCELLED"); expect(result.result).toBeNull(); expect(result.trace).toEqual([]);
  });
  it("expires abandoned claims on read and via bounded scheduled reconciliation without retrying", async () => {
    await setup(); const row = await startMarkSandbox(input, randomUUID());
    await prisma.agentSandboxRun.update({ where: { id: row.id }, data: { expiresAt: new Date(0), status: "RUNNING" } });
    expect((await getMarkSandbox(row.id)).status).toBe("FAILED");
    const newer = await startMarkSandbox(input, randomUUID()); await prisma.agentSandboxRun.update({ where: { id: newer.id }, data: { expiresAt: new Date(0) } });
    expect((await expireMarkSandboxRuns()).count).toBe(1); expect((await getMarkSandbox(newer.id)).result?.reason).toBe("timeout");
  });
  it("does not persist the entered question and pins the fixture/definition versions", async () => {
    const f = await setup(), value = { ...input, question: "private-8112345678" }, row = await startMarkSandbox(value, randomUUID());
    await runMarkSandboxPreview(row.id, value);
    const stored = await prisma.agentSandboxRun.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored).toMatchObject({ fixtureVersion: "mark-fixtures-v1", definitionVersion: 1 }); expect(JSON.stringify(stored)).not.toContain(value.question);
    expect(JSON.stringify(await prisma.auditLog.findMany({ where: { organizationId: f.org.id } }))).not.toContain(value.question);
  });
  it("rejects live/provider/tenant override input before any record is admitted", async () => {
    const f = await setup();
    for (const forged of [{ ...input, mode: "live" }, { ...input, organizationId: "other" }, { ...input, provider: "real", tools: ["write"] }]) await expect(startMarkSandbox(forged as unknown as SandboxInput, randomUUID())).rejects.toThrow();
    expect(await prisma.agentSandboxRun.count({ where: { organizationId: f.org.id } })).toBe(0);
  });
  it("denies inactive organizations, changed roles and disabled modules from fresh database state", async () => {
    const f = await setup(), row = await startMarkSandbox(input, randomUUID());
    await prisma.user.update({ where: { id: f.user.id }, data: { role: "AGENT" } }); await expect(runMarkSandboxPreview(row.id, input)).rejects.toThrow(/autorizado/);
    await prisma.user.update({ where: { id: f.user.id }, data: { role: "OWNER" } });
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: f.org.id, module: "AI_WHATSAPP" } }, data: { status: "SUSPENDED" } });
    await expect(readMarkSandbox(f.org.id, f.user.id, row.id)).rejects.toThrow(/autorizado/);
    await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: f.org.id, module: "AI_WHATSAPP" } }, data: { status: "ACTIVE" } });
    await prisma.organization.update({ where: { id: f.org.id }, data: { isActive: false } }); await expect(startMarkSandbox(input, randomUUID())).rejects.toThrow(/autorizado/);
  });
  it("feature rollback stops admission and skips reconciliation queries", async () => {
    await setup(); vi.stubEnv("AI_MARK_SANDBOX_ENABLED", "false"); const update = vi.spyOn(prisma.agentSandboxRun, "updateMany"), find = vi.spyOn(prisma.agentSandboxRun, "findMany");
    await expect(startMarkSandbox(input, randomUUID())).rejects.toThrow(/habilitadas/); expect((await expireMarkSandboxRuns()).count).toBe(0); expect(update).not.toHaveBeenCalled(); expect(find).not.toHaveBeenCalled();
  });
});
