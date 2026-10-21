"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAiManager } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { channelConnectionsEnabled, configureConnection, connectionInput, createConnection, effectiveConnectionState } from "@/lib/channel-connections/service";
async function manager() {
  const session = await requireAiManager();
  if (!await prisma.organization.findFirst({ where: { id: session.user.organizationId, isActive: true }, select: { id: true } })) throw new UserError("Organización inactiva");
  return session;
}
export async function listChannelConnections() {
  const session = await manager();
  if (!channelConnectionsEnabled()) return [];
  const rows = await prisma.channelConnection.findMany({ where: { organizationId: session.user.organizationId }, orderBy: { createdAt: "asc" }, select: { id: true, channel: true, label: true, enabled: true, version: true, generation: true, state: true, checkedAt: true, providerVerified: true, canReceive: true, canSend: true, route: { select: { agentInstanceId: true, enabled: true } } } });
  return rows.map(row => ({ ...row, effectiveState: effectiveConnectionState(row), canEnable: effectiveConnectionState({ ...row, enabled: true }) === "HEALTHY" }));
}
export async function registerChannelConnection(input: { channel: string; label: string; externalAccountKey: string }) {
  const session = await manager();
  const parsed = connectionInput.omit({ credentialRef: true }).strict().parse(input);
  // Existing n8n organization configuration resolves this reference + account key, never a browser credential.
  const result = await createConnection(session.user.organizationId, session.user.id, { ...parsed, credentialRef: "organization" });
  revalidatePath("/portal/ai-channels"); return result;
}
export async function updateChannelConnection(input: { id: string; expectedVersion: number; enabled: boolean; agentInstanceId?: string | null; resetVerification?: boolean }) {
  const session = await manager();
  const parsed = z.object({ id: z.string().min(1).max(100), expectedVersion: z.number().int().positive(), enabled: z.boolean(), agentInstanceId: z.string().min(1).max(100).nullable().optional(), resetVerification: z.boolean().optional() }).strict().parse(input);
  const result = await configureConnection(session.user.organizationId, session.user.id, parsed);
  revalidatePath("/portal/ai-channels"); return result;
}

/** Privileged migration helper. A reviewed quiet thread is required, not automatic backfill. */
export async function attachChannelHistory(input: { connectionId: string; conversationId: string; externalThreadId: string; expectedUpdatedAt: string; confirmed: true }) {
  const session = await manager();
  const parsed = z.object({ connectionId: z.string().min(1).max(100), conversationId: z.string().min(1).max(100), externalThreadId: z.string().trim().min(1).max(200), expectedUpdatedAt: z.string().datetime(), confirmed: z.literal(true) }).strict().parse(input);
  const result = await (await import("@/lib/channel-connections/service")).bindLegacyConversation(session.user.organizationId, session.user.id, { ...parsed, expectedUpdatedAt: new Date(parsed.expectedUpdatedAt) });
  revalidatePath(`/portal/conversations/${result.conversationId}`); return result;
}
