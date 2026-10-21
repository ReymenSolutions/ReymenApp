// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession } from "@/test/helpers";
import { cleanupAgentFixture } from "@/test/ai-agents-helpers";
import { backfillLegacyAgent, setAgentModelShadow } from "@/lib/ai/agents/model";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth(), isAdmin: (r: string) => ["ADMIN", "SUPER_ADMIN"].includes(r) }));
const { upsertWhatsAppAssistant } = await import("./whatsapp-assistant");
const { saveRulebook } = await import("./rulebook");
const { listAgentInstances, prepareLegacyAgent, updateLegacyAgent, setAgentObservation, getAgentExecutionTrace } = await import("./ai-agents");

describe("Phase 1 Server Actions: RBAC, tenant context, flags and trace redaction", () => {
  const ids: string[] = [];
  const setup = async (role: UserRole = "OWNER") => {
    const org = await createTestOrg("Phase1 actions"); ids.push(org.id);
    const user = await createTestUser(org.id, role, "phase1-manager");
    auth.mockResolvedValue(fakeSession(user));
    return { org, user };
  };
  beforeEach(() => vi.stubEnv("AI_AGENT_MODEL_ENABLED", "true"));
  afterEach(async () => { vi.unstubAllEnvs(); for (const id of ids.splice(0)) await cleanupAgentFixture(id); });

  it.each(["AGENT", "VIEWER", "CLIENT"] as UserRole[])("denies %s before reads/writes to private agent data", async role => {
    const { org } = await setup(role);
    for (const operation of [() => listAgentInstances(), () => prepareLegacyAgent(), () => setAgentObservation({ enabled: true, expectedHash: "a".repeat(64) }), () => updateLegacyAgent({ id: "forged", expectedVersion: 1, expectedHash: "a".repeat(64), publicName: "forged" }), () => getAgentExecutionTrace("forged")]) {
      await expect(operation()).rejects.toThrow("No autorizado");
    }
    expect(await prisma.agentInstance.count({ where: { organizationId: org.id } })).toBe(0);
    expect(await prisma.agentModelRollout.count({ where: { organizationId: org.id } })).toBe(0);
  });
  it("rejects anonymous requests", async () => {
    auth.mockResolvedValue(null);
    await expect(listAgentInstances()).rejects.toThrow("No autorizado");
    await expect(prepareLegacyAgent()).rejects.toThrow("No autorizado");
  });
  it.each(["OWNER", "MANAGER"] as UserRole[])("permits reviewed %s backfill/configuration without changing modes or plans", async role => {
    const { org } = await setup(role);
    const dry = await prepareLegacyAgent();
    const applied = await prepareLegacyAgent({ apply: true, expectedHash: dry.sourceHash });
    if (!applied.applied) throw new Error("fixture");
    expect(await updateLegacyAgent({ id: applied.instanceId, expectedVersion: 1, expectedHash: dry.sourceHash, publicName: "Mi asistente", rulebook: { voice: "Claro", greeting: "Hola", rules: "No inventar", pricing: "" } })).toMatchObject({ configVersion: 2 });
    const model = await listAgentInstances();
    expect(model).toMatchObject({ adapter: "legacy", shadowEnabled: false, source: { publicName: "Mi asistente", snapshot: { rulebook: { voice: "Claro" } } } });
    expect(await prisma.agentChannelSetting.count({ where: { organizationId: org.id } })).toBe(0);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.id } })).plan).toBe(org.plan);
  });
  it.each(["suspended", "module"])("rejects %s organization before backfill", async condition => {
    const { org } = await setup();
    if (condition === "suspended") await prisma.organization.update({ where: { id: org.id }, data: { isActive: false } });
    else await prisma.organizationModule.update({ where: { organizationId_module: { organizationId: org.id, module: "AI_WHATSAPP" } }, data: { status: "CANCELLED" } });
    await expect(prepareLegacyAgent()).rejects.toThrow(condition === "suspended" ? /inactiva/ : /módulo/);
    expect(await prisma.agentInstance.count({ where: { organizationId: org.id } })).toBe(0);
  });
  it("input cannot override the session tenant or introduce tool/config grants", async () => {
    await setup();
    await expect(prepareLegacyAgent({ organizationId: "forged" } as never)).rejects.toThrow();
    await expect(updateLegacyAgent({ id: "forged", expectedVersion: 1, expectedHash: "a".repeat(64), publicName: "name", tools: ["sql"] } as never)).rejects.toThrow();
  });
  it("foreign instance and trace IDs disclose nothing and do not create rows in the other tenant", async () => {
    const a = await setup(), b = await setup();
    const dry = await backfillLegacyAgent(a.org.id), applied = await backfillLegacyAgent(a.org.id, { apply: true, expectedHash: dry.sourceHash });
    if (!applied.applied) throw new Error("fixture");
    const trace = await prisma.agentExecution.create({ data: { organizationId: a.org.id, agentInstanceId: applied.instanceId, configVersion: 1, conversationId: "fixture", messageId: "fixture", operation: "fixture", legacyJobId: "fixture" } });
    await expect(updateLegacyAgent({ id: applied.instanceId, expectedVersion: 1, expectedHash: dry.sourceHash, publicName: "Attack" })).rejects.toThrow(/no encontrado/);
    await expect(getAgentExecutionTrace(trace.id)).rejects.toThrow(/no encontrada/);
    expect(await prisma.agentInstance.count({ where: { organizationId: b.org.id } })).toBe(0);
  });
  it("authorized trace exposes metadata, never stored configuration/private instruction text", async () => {
    const { org } = await setup(); const dry = await prepareLegacyAgent(), applied = await prepareLegacyAgent({ apply: true, expectedHash: dry.sourceHash });
    if (!applied.applied) throw new Error("fixture");
    const row = await prisma.agentExecution.create({ data: { organizationId: org.id, agentInstanceId: applied.instanceId, configVersion: 1, conversationId: "private-conv", messageId: "private-message", operation: "ai.auto_reply", legacyJobId: "private-job" } });
    const trace = await getAgentExecutionTrace(row.id);
    expect(trace).toMatchObject({ configVersion: 1, status: "QUEUED", steps: [] });
    expect(trace).not.toHaveProperty("snapshot"); expect(trace).not.toHaveProperty("conversationId"); expect(trace).not.toHaveProperty("legacyJobId");
    expect(JSON.stringify(trace)).not.toContain("private-");
  });
  it("existing identity/rulebook forms append revisions after backfill without overwriting earlier snapshots", async () => {
    const { org } = await setup(); const dry = await prepareLegacyAgent();
    await prepareLegacyAgent({ apply: true, expectedHash: dry.sourceHash });
    await upsertWhatsAppAssistant({ name: "Nombre desde formulario actual" });
    await saveRulebook({ voice: "Voz desde formulario actual", greeting: "", rules: "", pricing: "" });
    expect(await prisma.agentConfigRevision.count({ where: { organizationId: org.id } })).toBe(3);
    expect(await prisma.agentConfigRevision.findFirst({ where: { organizationId: org.id, version: 1 } })).toMatchObject({ sourceHash: dry.sourceHash });
    expect((await listAgentInstances()).instance).toMatchObject({ publicName: "Nombre desde formulario actual", configVersion: 3 });
  });
  it("global rollback disables new APIs while legacy listing remains compatible", async () => {
    const { org, user } = await setup(); const dry = await backfillLegacyAgent(org.id);
    await setAgentModelShadow(org.id, true, dry.sourceHash, user.id);
    vi.stubEnv("AI_AGENT_MODEL_ENABLED", "false");
    expect(await listAgentInstances()).toMatchObject({ adapter: "legacy", instance: null, shadowEnabled: false });
    await expect(setAgentObservation({ enabled: false, expectedHash: dry.sourceHash })).rejects.toThrow(/entorno/);
    await expect(prepareLegacyAgent({ apply: true, expectedHash: dry.sourceHash })).rejects.toThrow(/entorno/);
    expect(await prisma.agentInstance.count({ where: { organizationId: org.id } })).toBe(1);
  });
});
