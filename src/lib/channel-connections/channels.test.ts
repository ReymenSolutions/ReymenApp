// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelConnection, UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanupAgentFixture } from "@/test/ai-agents-helpers";
import { createTestOrg, createTestUser, fakeSession } from "@/test/helpers";
import { backfillLegacyAgent } from "@/lib/ai/agents/model";
import { registerChannelConnection, updateChannelConnection, listChannelConnections, attachChannelHistory } from "@/actions/channel-connections";
import { configureConnection, effectiveConnectionState, HEALTH_TTL_MS } from "./service";
import { processChannelEvent } from "./events";
import { processConversationEvent, processMessageStatusEvent } from "@/lib/webhook-processors";
import { processAutoReplyJob } from "@/lib/ai-auto-reply";
import { sendManualMessage, takeHumanControl } from "@/actions/conversations";
import { phoneKey } from "@/lib/phone";
import { AUTO_JOB_SOURCE, AUTO_JOB_TYPE } from "@/lib/ai-auto-jobs";
const auth = vi.fn(), trigger = vi.fn(), generate = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => auth(), isAdmin: (role: string) => ["ADMIN", "SUPER_ADMIN"].includes(role) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async original => ({ ...await original<typeof import("next/server")>(), after: vi.fn() }));
vi.mock("@/lib/n8n", () => ({ triggerN8nWorkflow: (...args: unknown[]) => trigger(...args) }));
vi.mock("@/lib/ai-draft", async original => ({ ...await original<typeof import("@/lib/ai-draft")>(), generateText: (...args: unknown[]) => generate(...args), isDraftProviderConfigured: () => true }));
vi.mock("@/lib/admin-notifications", () => ({ notifyAdmins: vi.fn().mockResolvedValue(undefined) }));
const orgs: string[] = [];
const response = () => ({ text: JSON.stringify({ action: "reply", reply: "Abrimos a las 9." }), model: "fixture", inputTokens: 1, outputTokens: 1 });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
async function fixture() {
  const org = await createTestOrg("Phase3"); orgs.push(org.id);
  const owner = await createTestUser(org.id, "OWNER", "phase3"); auth.mockResolvedValue(fakeSession(owner));
  await prisma.whatsAppAssistant.create({ data: { organizationId: org.id, name: "Asistente preservado", capabilities: [] } });
  const dry = await backfillLegacyAgent(org.id); await backfillLegacyAgent(org.id, { apply: true, expectedHash: dry.sourceHash });
  const agent = await prisma.agentInstance.findFirstOrThrow({ where: { organizationId: org.id } });
  const saved = await registerChannelConnection({ label: "Cuenta principal", channel: "whatsapp", externalAccountKey: "provider-account-a" });
  return { org, owner, agent, connection: await prisma.channelConnection.findUniqueOrThrow({ where: { id: saved.id } }) };
}
const base = (row: ChannelConnection) => ({ version: 1 as const, connectionId: row.id, externalAccountKey: row.externalAccountKey, generation: row.generation });
async function health(row: ChannelConnection, sequence = 1, extra: Record<string, unknown> = {}) {
  return processChannelEvent({ ...base(row), type: "health", eventId: `health-${sequence}`, sequence, observedAt: new Date().toISOString(), state: "HEALTHY", providerVerified: true, canReceive: true, canSend: true, outboundContractVersion: 1, ...extra }, row.organizationId);
}
async function enable(f: Awaited<ReturnType<typeof fixture>>) {
  auth.mockResolvedValue(fakeSession(f.owner));
  await health(f.connection);
  await updateChannelConnection({ id: f.connection.id, expectedVersion: 1, enabled: true, agentInstanceId: f.agent.id });
}
async function incoming(row: ChannelConnection, id = "in-1", extra = {}) {
  const result = await processChannelEvent({ ...base(row), type: "message", eventId: id, externalThreadId: "thread-1", contactPhone: "8112345678", message: { externalId: id, content: "Horario?" }, ...extra }, row.organizationId);
  if (!("conversationId" in result)) throw new Error("Missing conversation"); return result.conversationId;
}

beforeEach(() => { vi.stubEnv("AI_CHANNEL_CONNECTIONS_ENABLED", "true"); vi.stubEnv("AI_AGENT_MODEL_ENABLED", "true"); trigger.mockReset().mockResolvedValue({ success: true }); generate.mockReset().mockResolvedValue(response()); });
afterEach(async () => {
  for (const organizationId of orgs.splice(0)) {
    await prisma.channelRouting.deleteMany({ where: { organizationId } });
    await prisma.conversation.updateMany({ where: { organizationId }, data: { channelConnectionId: null, externalThreadId: null } });
    await prisma.channelConnection.deleteMany({ where: { organizationId } });
    await cleanupAgentFixture(organizationId);
  }
  vi.unstubAllEnvs();
});
describe("Phase3 account isolation, configuration and health", () => {
  it.each(["AGENT", "VIEWER", "CLIENT"] as UserRole[])("denies %s all direct account actions", async role => {
    const f = await fixture(); auth.mockResolvedValue(fakeSession({ ...f.owner, role }));
    await expect(registerChannelConnection({ label: "forged", channel: "whatsapp", externalAccountKey: "other" })).rejects.toThrow();
    await expect(updateChannelConnection({ id: f.connection.id, expectedVersion: 1, enabled: true })).rejects.toThrow();
    await expect(listChannelConnections()).rejects.toThrow();
    await expect(attachChannelHistory({ connectionId: f.connection.id, conversationId: "forged", externalThreadId: "forged", expectedUpdatedAt: new Date().toISOString(), confirmed: true })).rejects.toThrow();
    expect(await prisma.channelConnection.count({ where: { organizationId: f.org.id } })).toBe(1);
  });
  it("starts unverified/paused, rejects unsupported channels/secrets and never changes the legacy name or modes", async () => {
    const f = await fixture();
    expect(f.connection).toMatchObject({ state: "UNVERIFIED", enabled: false, providerVerified: false });
    await expect(updateChannelConnection({ id: f.connection.id, expectedVersion: 1, enabled: true })).rejects.toThrow(/verificar/);
    await expect(registerChannelConnection({ label: "x", channel: "../webhook", externalAccountKey: "x" })).rejects.toThrow();
    await expect(registerChannelConnection({ label: "x", channel: "whatsapp", externalAccountKey: "x", credentialRef: "browser-secret" } as never)).rejects.toThrow();
    const view = JSON.stringify(await listChannelConnections()); expect(view).not.toContain("credentialRef"); expect(view).not.toContain("provider-account-a");
    expect(await prisma.whatsAppAssistant.findUnique({ where: { organizationId: f.org.id } })).toMatchObject({ name: "Asistente preservado" });
    expect(await prisma.agentChannelSetting.count({ where: { organizationId: f.org.id } })).toBe(0);
  });
  it("rejects foreign account/route IDs, suspended tenants and inactive modules", async () => {
    const a = await fixture(), b = await fixture(); auth.mockResolvedValue(fakeSession(a.owner));
    await expect(updateChannelConnection({ id: b.connection.id, expectedVersion: 1, enabled: false })).rejects.toThrow(/encontrada/);
    await expect(updateChannelConnection({ id: a.connection.id, expectedVersion: 1, enabled: false, agentInstanceId: b.agent.id })).rejects.toThrow(/disponible/);
    await prisma.organization.update({ where: { id: a.org.id }, data: { isActive: false } }); await expect(listChannelConnections()).rejects.toThrow();
    await prisma.organization.update({ where: { id: a.org.id }, data: { isActive: true } }); await prisma.organizationModule.updateMany({ where: { organizationId: a.org.id, module: "AI_WHATSAPP" }, data: { status: "SUSPENDED" } }); await expect(listChannelConnections()).rejects.toThrow();
  });
  it("serializes competing edits, permits one default and retains a disabled route when selecting manual handling", async () => {
    const f = await fixture(); await health(f.connection);
    const results = await Promise.allSettled([configureConnection(f.org.id, f.owner.id, { id: f.connection.id, expectedVersion: 1, enabled: true, agentInstanceId: f.agent.id }), configureConnection(f.org.id, f.owner.id, { id: f.connection.id, expectedVersion: 1, enabled: true })]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    const row = await prisma.channelConnection.findUniqueOrThrow({ where: { id: f.connection.id } });
    await configureConnection(f.org.id, f.owner.id, { id: row.id, expectedVersion: row.version, enabled: true, agentInstanceId: f.agent.id });
    await configureConnection(f.org.id, f.owner.id, { id: row.id, expectedVersion: row.version + 1, enabled: true, agentInstanceId: null });
    expect(await prisma.channelRouting.findUnique({ where: { connectionId: row.id } })).toMatchObject({ enabled: false });
  });
  it("resets verification for a paused account without replacing the account or its history", async () => {
    const f = await fixture(); await health(f.connection, 2147483647, { state: "DISCONNECTED", providerVerified: false });
    await updateChannelConnection({ id: f.connection.id, expectedVersion: 1, enabled: false, resetVerification: true });
    const current = await prisma.channelConnection.findUniqueOrThrow({ where: { id: f.connection.id } }); expect(current).toMatchObject({ generation: 2, healthSequence: 0, enabled: false });
    await health(current, 1); await updateChannelConnection({ id: current.id, expectedVersion: 2, enabled: true });
    expect(await prisma.channelConnection.count({ where: { organizationId: f.org.id } })).toBe(1);
    await expect(updateChannelConnection({ id: current.id, expectedVersion: 3, enabled: true, resetVerification: true })).rejects.toThrow(/Pausa/);
  });
  it("ignores older health, expires observations, rejects replay after pause and refuses paused agents", async () => {
    const f = await fixture(); await health(f.connection, 2, { state: "DISCONNECTED" }); await health(f.connection, 1);
    expect(await prisma.channelConnection.findUnique({ where: { id: f.connection.id } })).toMatchObject({ state: "DISCONNECTED" });
    await health(f.connection, 3); await updateChannelConnection({ id: f.connection.id, expectedVersion: 1, enabled: true });
    expect(effectiveConnectionState({ ...f.connection, enabled: true, providerVerified: true, state: "HEALTHY", checkedAt: new Date(Date.now() - HEALTH_TTL_MS - 1) })).toBe("STALE");
    await updateChannelConnection({ id: f.connection.id, expectedVersion: 2, enabled: false }); await expect(health(f.connection, 4)).rejects.toThrow(/generation/);
    await prisma.agentInstance.update({ where: { id: f.agent.id }, data: { status: "PAUSED" } });
    await expect(updateChannelConnection({ id: f.connection.id, expectedVersion: 3, enabled: false, agentInstanceId: f.agent.id })).rejects.toThrow(/disponible/);
  });
});
describe("Phase3 ingress and outbound account boundaries", () => {
  it("does not reserve unverified IDs but rejects the same verified provider account in two tenants", async () => {
    const a = await fixture(), b = await fixture();
    const results = await Promise.allSettled([health(a.connection), health(b.connection)]);
    expect(results.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.channelConnection.count({ where: { externalAccountKey: a.connection.externalAccountKey, providerVerified: true } })).toBe(1);
  });
  it("adopts a reviewed quiet legacy thread without changing IDs/messages and preserves old callbacks", async () => {
    const f = await fixture(); await enable(f);
    const old = await prisma.conversation.create({ data: { organizationId: f.org.id, channel: "whatsapp", contactPhone: "8112345678", phoneKey: phoneKey("8112345678") } });
    const original = await prisma.message.create({ data: { conversationId: old.id, role: "AGENT", content: "Historia preservada", deliveryStatus: "SENT" } });
    await attachChannelHistory({ connectionId: f.connection.id, conversationId: old.id, externalThreadId: "thread-1", expectedUpdatedAt: old.updatedAt.toISOString(), confirmed: true });
    expect(await incoming(f.connection)).toBe(old.id);
    expect(await prisma.message.findUnique({ where: { id: original.id } })).toMatchObject({ content: "Historia preservada", conversationId: old.id });
    await processMessageStatusEvent({ messageId: original.id, status: "READ" }, f.org.id);
    expect(await prisma.message.findUnique({ where: { id: original.id } })).toMatchObject({ deliveryStatus: "READ" });
    await expect(attachChannelHistory({ connectionId: f.connection.id, conversationId: old.id, externalThreadId: "other", expectedUpdatedAt: old.updatedAt.toISOString(), confirmed: true })).rejects.toThrow();
  });
  it("blocks history adoption across organizations, with stale review or with unfinished work", async () => {
    const f = await fixture(), foreign = await fixture(); await enable(f); auth.mockResolvedValue(fakeSession(f.owner));
    const old = await prisma.conversation.create({ data: { organizationId: f.org.id, channel: "whatsapp", contactPhone: "8112345678" } });
    const input = { connectionId: f.connection.id, conversationId: old.id, externalThreadId: "thread-1", expectedUpdatedAt: old.updatedAt.toISOString(), confirmed: true as const };
    await expect(attachChannelHistory({ ...input, connectionId: foreign.connection.id })).rejects.toThrow();
    await expect(attachChannelHistory({ ...input, expectedUpdatedAt: new Date(0).toISOString() })).rejects.toThrow();
    await prisma.webhookEvent.create({ data: { organizationId: f.org.id, source: AUTO_JOB_SOURCE, eventType: AUTO_JOB_TYPE, status: "PENDING", payload: { conversationId: old.id } } });
    await expect(attachChannelHistory(input)).rejects.toThrow(/pendientes/);
    expect(await prisma.conversation.findUnique({ where: { id: old.id } })).toMatchObject({ channelConnectionId: null });
  });
  it("enforces tenant foreign keys even for direct database writes", async () => {
    const a = await fixture(), b = await fixture();
    await expect(prisma.channelRouting.create({ data: { organizationId: a.org.id, connectionId: a.connection.id, agentInstanceId: b.agent.id } })).rejects.toThrow();
    await expect(prisma.conversation.create({ data: { organizationId: a.org.id, channel: "whatsapp", channelConnectionId: b.connection.id, externalThreadId: "foreign" } })).rejects.toThrow();
  });
  it("keeps two accounts and legacy threads distinct while sharing a CRM person and deduplicating concurrent deliveries", async () => {
    const f = await fixture(); await enable(f);
    const second = await registerChannelConnection({ channel: "whatsapp", label: "Cuenta B", externalAccountKey: "provider-account-b" });
    const row = await prisma.channelConnection.findUniqueOrThrow({ where: { id: second.id } }); await health(row); await updateChannelConnection({ id: row.id, expectedVersion: 1, enabled: true });
    const [a, again, b] = await Promise.all([incoming(f.connection), incoming(f.connection), incoming(row)]); expect(a).toBe(again); expect(a).not.toBe(b);
    expect(await prisma.message.count({ where: { conversationId: a, role: "USER" } })).toBe(1);
    const legacy = await processConversationEvent({ channel: "whatsapp", contactPhone: "8112345678", message: { role: "USER", content: "Legacy", externalId: "legacy" } }, f.org.id); expect(legacy.conversationId).not.toBe(a); expect(legacy.conversationId).not.toBe(b);
    const conversations = await prisma.conversation.findMany({ where: { organizationId: f.org.id } }); expect(new Set(conversations.map(c => c.leadId)).size).toBe(1);
    await expect(processConversationEvent({ conversationId: a, message: { role: "USER", content: "forged" } }, f.org.id)).rejects.toThrow();
    await expect(incoming(f.connection, "forged", { contactPhone: "8187654321" })).rejects.toThrow(/identity/);
  });
  it("routes manual text to the versioned workflow only, blocks unsafe media and accepts monotonic late acknowledgements after pause", async () => {
    const f = await fixture(); await enable(f); const conversationId = await incoming(f.connection);
    await expect(sendManualMessage({ conversationId, content: "", attachmentUrl: "http://127.0.0.1/private" })).rejects.toThrow(/texto/);
    await sendManualMessage({ conversationId, content: "Hola" });
    expect(trigger).toHaveBeenCalledWith("channel-outbound-v1", expect.objectContaining({ data: expect.objectContaining({ connectionId: f.connection.id, externalAccountKey: "provider-account-a", credentialRef: "organization", generation: 1, idempotencyKey: expect.any(String) }) }));
    const message = await prisma.message.findFirstOrThrow({ where: { conversationId, role: "AGENT" } });
    await updateChannelConnection({ id: f.connection.id, expectedVersion: 2, enabled: false });
    for (const status of ["READ", "SENT", "FAILED"]) await processChannelEvent({ ...base(f.connection), type: "status", eventId: status, status, messageId: message.id }, f.org.id);
    expect(await prisma.message.findUnique({ where: { id: message.id } })).toMatchObject({ deliveryStatus: "READ" });
    await expect(processMessageStatusEvent({ messageId: message.id, status: "FAILED" }, f.org.id)).rejects.toThrow();
    await expect(sendManualMessage({ conversationId, content: "Blocked" })).rejects.toThrow(); expect(trigger).toHaveBeenCalledTimes(1);
  });
  it.each(["pause", "human", "agent", "flag", "expired"])("suppresses late AI after %s without calling transport", async change => {
    const f = await fixture(); await enable(f); await prisma.agentChannelSetting.create({ data: { organizationId: f.org.id, channel: "whatsapp", mode: "AUTO" } });
    const conversationId = await incoming(f.connection); const job = await prisma.webhookEvent.findFirstOrThrow({ where: { organizationId: f.org.id, eventType: AUTO_JOB_TYPE } });
    const started = deferred<void>(), result = deferred<ReturnType<typeof response>>(); generate.mockImplementation(() => { started.resolve(); return result.promise; });
    const running = processAutoReplyJob(job.id); await started.promise;
    if (change === "pause") await updateChannelConnection({ id: f.connection.id, expectedVersion: 2, enabled: false });
    if (change === "human") await takeHumanControl(conversationId);
    if (change === "agent") await prisma.agentInstance.update({ where: { id: f.agent.id }, data: { status: "PAUSED" } });
    if (change === "flag") vi.stubEnv("AI_CHANNEL_CONNECTIONS_ENABLED", "false");
    if (change === "expired") await prisma.channelConnection.update({ where: { id: f.connection.id }, data: { checkedAt: new Date(Date.now() - HEALTH_TTL_MS - 1) } });
    result.resolve(response()); expect(await running).toBe("skipped"); expect(trigger).not.toHaveBeenCalled();
  });
  it("serializes pause behind transport admission and blocks the next manual send", async () => {
    const f = await fixture(); await enable(f); const conversationId = await incoming(f.connection);
    const started = deferred<void>(), release = deferred<void>(); const order: string[] = [];
    trigger.mockImplementation(async () => { started.resolve(); await release.promise; order.push("accepted"); return { success: true }; });
    const sending = sendManualMessage({ conversationId, content: "Hola" }); await started.promise;
    const pausing = updateChannelConnection({ id: f.connection.id, expectedVersion: 2, enabled: false }).then(() => order.push("paused"));
    try {
      await expect.poll(async () => {
        const result = await prisma.$queryRaw<{ waiting: bigint }[]>`SELECT count(*) AS waiting FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%ChannelConnection%'`;
        return Number(result[0].waiting);
      }, { timeout: 3000 }).toBeGreaterThan(0);
    } finally { release.resolve(); }
    await Promise.all([sending, pausing]); expect(order).toEqual(["accepted", "paused"]);
    await expect(sendManualMessage({ conversationId, content: "No debe salir" })).rejects.toThrow(); expect(trigger).toHaveBeenCalledTimes(1);
  });
  it("competing AUTO workers dispatch once using the registered account", async () => {
    const f = await fixture(); await enable(f); await prisma.agentChannelSetting.create({ data: { organizationId: f.org.id, channel: "whatsapp", mode: "AUTO" } });
    await incoming(f.connection); const job = await prisma.webhookEvent.findFirstOrThrow({ where: { organizationId: f.org.id, eventType: AUTO_JOB_TYPE } });
    await Promise.all([processAutoReplyJob(job.id), processAutoReplyJob(job.id)]);
    expect(trigger).toHaveBeenCalledTimes(1); expect(generate).toHaveBeenCalledTimes(1);
    expect(trigger.mock.calls[0][1].data.connectionId).toBe(f.connection.id);
  });
  it("keeps CRM-only manual operation after suspending AI without admitting new AI work", async () => {
    const f = await fixture(); await enable(f);
    await prisma.agentChannelSetting.create({ data: { organizationId: f.org.id, channel: "whatsapp", mode: "AUTO" } });
    await prisma.organizationModule.updateMany({ where: { organizationId: f.org.id, module: "AI_WHATSAPP" }, data: { status: "SUSPENDED" } });
    const conversationId = await incoming(f.connection);
    expect(await prisma.webhookEvent.count({ where: { organizationId: f.org.id, eventType: AUTO_JOB_TYPE } })).toBe(0);
    await sendManualMessage({ conversationId, content: "Te atiende el equipo" });
    expect(trigger).toHaveBeenCalledTimes(1); expect(trigger.mock.calls[0][0]).toBe("channel-outbound-v1"); expect(generate).not.toHaveBeenCalled();
    await expect(listChannelConnections()).rejects.toThrow();
  });
  it("global pause blocks bound manual sends while legacy manual replies still use their original path", async () => {
    const f = await fixture(); await enable(f); const bound = await incoming(f.connection);
    const legacy = await prisma.conversation.create({ data: { organizationId: f.org.id, channel: "whatsapp", contactPhone: "8187654321" } });
    vi.stubEnv("AI_CHANNEL_CONNECTIONS_ENABLED", "false");
    await expect(sendManualMessage({ conversationId: bound, content: "Blocked" })).rejects.toThrow();
    await sendManualMessage({ conversationId: legacy.id, content: "Legacy continues" });
    expect(trigger).toHaveBeenCalledTimes(1); expect(trigger.mock.calls[0][0]).toBe("whatsapp-outbound");
    expect(await listChannelConnections()).toEqual([]);
  });
  it("sends AUTO once via the connection and never replays an uncertain send", async () => {
    const f = await fixture(); await enable(f); await prisma.agentChannelSetting.create({ data: { organizationId: f.org.id, channel: "whatsapp", mode: "AUTO" } });
    await incoming(f.connection); const job = await prisma.webhookEvent.findFirstOrThrow({ where: { organizationId: f.org.id, eventType: AUTO_JOB_TYPE } }); trigger.mockResolvedValue({ success: false });
    expect(await processAutoReplyJob(job.id)).toBe("escalated"); await processAutoReplyJob(job.id); expect(trigger).toHaveBeenCalledTimes(1); expect(trigger.mock.calls[0][0]).toBe("channel-outbound-v1");
  });
});
