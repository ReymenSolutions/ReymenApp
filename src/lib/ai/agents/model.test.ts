// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupAgentFixture } from "@/test/ai-agents-helpers";
import { createTestOrg } from "@/test/helpers";
import { buildBusinessInstructions } from "@/lib/rulebook";
import { getAgentCap } from "@/lib/agent-cap";
import { readLegacyConfiguration } from "./legacy";
import { backfillLegacyAgent, configureLegacyAgent, getLegacyAgentModel, setAgentModelShadow } from "./model";

describe("Phase 1 legacy adapter, inventory and versioned configuration", () => {
  const ids: string[] = [];
  const setup = async () => {
    const org = await createTestOrg("Phase1 model"); ids.push(org.id);
    const assistant = await prisma.whatsAppAssistant.create({ data: { organizationId: org.id, name: "Sofía del negocio", greeting: "Saludo personalizado", personality: "Personalidad histórica", capabilities: ["horarios", "precios"], phoneNumber: "8112345678", isActive: false } });
    await prisma.businessRulebook.create({ data: { organizationId: org.id, voice: "Habla claro", greeting: "Hola", rules: "No inventes", pricing: "$150" } });
    await prisma.agentChannelSetting.create({ data: { organizationId: org.id, channel: "whatsapp", mode: "OFF" } });
    await prisma.knowledgeBase.create({ data: { organizationId: org.id, title: "Horario", content: "De 9 a 6", tags: ["horario"] } });
    await prisma.prompt.create({ data: { organizationId: org.id, name: "Histórico", type: "SYSTEM", content: "Texto antiguo", isActive: true, versions: { create: { version: 1, content: "Texto antiguo" } } } });
    return { org, assistant };
  };
  beforeEach(() => vi.stubEnv("AI_AGENT_MODEL_ENABLED", "true"));
  afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const id of ids.splice(0)) await cleanupAgentFixture(id); });

  it("dry-run defaults to read-only and preserves legacy text, modes, prompt history and rights", async () => {
    const { org } = await setup();
    const before = await readLegacyConfiguration(prisma, org.id);
    const prompt = await buildBusinessInstructions(org.id), cap = await getAgentCap(org.id);
    const run = await backfillLegacyAgent(org.id);
    expect(run).toMatchObject({ applied: false, sourceHash: before.sourceHash, inventory: { articles: 1, prompts: 1, promptVersions: 1, activeChannels: 5 } });
    expect(await prisma.agentInstance.count({ where: { organizationId: org.id } })).toBe(0);
    expect((await readLegacyConfiguration(prisma, org.id)).sourceHash).toBe(before.sourceHash);
    expect(await buildBusinessInstructions(org.id)).toBe(prompt);
    expect(await getAgentCap(org.id)).toEqual(cap);
  });
  it("global gate off reads legacy without querying any new table", async () => {
    const { org } = await setup(); vi.stubEnv("AI_AGENT_MODEL_ENABLED", "false");
    const instance = vi.spyOn(prisma.agentInstance, "findUnique").mockRejectedValue(new Error("table not migrated"));
    const rollout = vi.spyOn(prisma.agentModelRollout, "findUnique").mockRejectedValue(new Error("table not migrated"));
    expect(await getLegacyAgentModel(org.id)).toMatchObject({ adapter: "legacy", shadowEnabled: false, instance: null, source: { publicName: "Sofía del negocio" } });
    expect(instance).not.toHaveBeenCalled(); expect(rollout).not.toHaveBeenCalled();
    await expect(backfillLegacyAgent(org.id, { apply: true })).rejects.toThrow(/entorno/);
  });
  it("requires a reviewed hash for apply and rejects source drift", async () => {
    const { org } = await setup();
    await expect(backfillLegacyAgent(org.id, { apply: true })).rejects.toThrow(/comparación/);
    const dry = await backfillLegacyAgent(org.id);
    await prisma.whatsAppAssistant.update({ where: { organizationId: org.id }, data: { name: "Cambió después" } });
    await expect(backfillLegacyAgent(org.id, { apply: true, expectedHash: dry.sourceHash })).rejects.toThrow(/cambió/);
    expect(await prisma.agentInstance.count({ where: { organizationId: org.id } })).toBe(0);
  });
  it("concurrent backfills create one instance and revision, with zero legacy changes or automatic activation", async () => {
    const { org } = await setup(); const dry = await backfillLegacyAgent(org.id);
    const results = await Promise.all(Array.from({ length: 3 }, () => backfillLegacyAgent(org.id, { apply: true, expectedHash: dry.sourceHash })));
    expect(new Set(results.map(r => r.applied && r.instanceId)).size).toBe(1);
    expect(await prisma.agentConfigRevision.count({ where: { organizationId: org.id } })).toBe(1);
    expect(await prisma.agentModelRollout.findUnique({ where: { organizationId: org.id } })).toBeNull();
    const instance = await prisma.agentInstance.findFirstOrThrow({ where: { organizationId: org.id }, include: { definition: true, revisions: true } });
    expect(instance).toMatchObject({ publicName: "Sofía del negocio", status: "LEGACY", configVersion: 1, definition: { key: "legacy-assistant" } });
    expect(instance.revisions[0].snapshot).toMatchObject({ assistant: { isActive: false, greeting: "Saludo personalizado", personality: "Personalidad histórica", capabilities: ["horarios", "precios"] } });
    expect((await readLegacyConfiguration(prisma, org.id)).sourceHash).toBe(dry.sourceHash);
    expect(JSON.stringify(instance.definition.manifest)).not.toMatch(/Mark|Alex/);
  });
  it("absent assistant remains absent, without rewriting missing channel defaults", async () => {
    const org = await createTestOrg("Phase1 absent"); ids.push(org.id);
    const dry = await backfillLegacyAgent(org.id);
    await backfillLegacyAgent(org.id, { apply: true, expectedHash: dry.sourceHash });
    expect(await prisma.whatsAppAssistant.findUnique({ where: { organizationId: org.id } })).toBeNull();
    expect(await prisma.agentChannelSetting.count({ where: { organizationId: org.id } })).toBe(0);
    expect((await readLegacyConfiguration(prisma, org.id)).sourceHash).toBe(dry.sourceHash);
  });
  it("changed legacy sources append a revision without modifying the first snapshot", async () => {
    const { org } = await setup(); const dry = await backfillLegacyAgent(org.id);
    await backfillLegacyAgent(org.id, { apply: true, expectedHash: dry.sourceHash });
    const old = await prisma.agentConfigRevision.findFirstOrThrow({ where: { organizationId: org.id } });
    await prisma.businessRulebook.update({ where: { organizationId: org.id }, data: { voice: "Nueva voz" } });
    const next = await backfillLegacyAgent(org.id);
    expect(await backfillLegacyAgent(org.id, { apply: true, expectedHash: next.sourceHash })).toMatchObject({ configVersion: 2 });
    expect(await prisma.agentConfigRevision.findFirst({ where: { organizationId: org.id, version: 1 } })).toEqual(old);
  });
  it("optimistic version/hash allows only one competing edit and preserves assistant fields not edited", async () => {
    const { org } = await setup(); const dry = await backfillLegacyAgent(org.id);
    const applied = await backfillLegacyAgent(org.id, { apply: true, expectedHash: dry.sourceHash });
    if (!applied.applied) throw new Error("fixture");
    const edit = { id: applied.instanceId, expectedVersion: 1, expectedHash: dry.sourceHash };
    const results = await Promise.allSettled(["Nombre A", "Nombre B"].map(publicName => configureLegacyAgent(org.id, { ...edit, publicName }, "fixture-manager")));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")).toHaveLength(1);
    expect(await prisma.whatsAppAssistant.findUnique({ where: { organizationId: org.id } })).toMatchObject({ greeting: "Saludo personalizado", personality: "Personalidad histórica", isActive: false, phoneNumber: "8112345678" });
    expect(await prisma.agentConfigRevision.count({ where: { organizationId: org.id } })).toBe(2);
  });
  it("tenant mismatch is rejected by both service and composite revision FK", async () => {
    const a = await setup(), b = await setup();
    const dry = await backfillLegacyAgent(a.org.id), applied = await backfillLegacyAgent(a.org.id, { apply: true, expectedHash: dry.sourceHash });
    if (!applied.applied) throw new Error("fixture");
    const bBefore = await readLegacyConfiguration(prisma, b.org.id);
    await expect(configureLegacyAgent(b.org.id, { id: applied.instanceId, expectedVersion: 1, expectedHash: bBefore.sourceHash, publicName: "Intruso" }, "fixture")).rejects.toThrow(/no encontrado/);
    await expect(prisma.agentConfigRevision.create({ data: { organizationId: b.org.id, agentInstanceId: applied.instanceId, version: 99, sourceHash: dry.sourceHash, snapshot: {} } })).rejects.toMatchObject({ code: "P2003" });
    expect((await readLegacyConfiguration(prisma, b.org.id)).sourceHash).toBe(bBefore.sourceHash);
  });
  it("tenant shadow on/off preserves counts, text, channel caps and historical revisions", async () => {
    const { org } = await setup(); const before = await readLegacyConfiguration(prisma, org.id), cap = await getAgentCap(org.id);
    await setAgentModelShadow(org.id, true, before.sourceHash, "fixture");
    await setAgentModelShadow(org.id, false, before.sourceHash, "fixture");
    expect((await getLegacyAgentModel(org.id)).shadowEnabled).toBe(false);
    expect((await readLegacyConfiguration(prisma, org.id)).sourceHash).toBe(before.sourceHash);
    expect(await getAgentCap(org.id)).toEqual(cap);
    expect(await prisma.agentConfigRevision.count({ where: { organizationId: org.id } })).toBe(1);
  });
  it("ambiguous assistant remapping requires review rather than silently reassociating IDs", async () => {
    const { org, assistant } = await setup(); const dry = await backfillLegacyAgent(org.id);
    await backfillLegacyAgent(org.id, { apply: true, expectedHash: dry.sourceHash });
    await prisma.whatsAppAssistant.delete({ where: { id: assistant.id } });
    await prisma.whatsAppAssistant.create({ data: { organizationId: org.id, name: "Reemplazo", capabilities: [] } });
    const next = await backfillLegacyAgent(org.id);
    await expect(backfillLegacyAgent(org.id, { apply: true, expectedHash: next.sourceHash })).rejects.toThrow(/revisión/);
    expect(await prisma.agentConfigRevision.count({ where: { organizationId: org.id } })).toBe(1);
  });
});
