import { AUTO_JOB_SOURCE, AUTO_JOB_MAX_ATTEMPTS } from "@/lib/ai-job-contract";
import { z } from "zod";
import type { Prisma, ChannelConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { INBOX_CHANNELS } from "@/lib/channels";

export const channelConnectionsEnabled = () => process.env.AI_CHANNEL_CONNECTIONS_ENABLED === "true";
export const HEALTH_TTL_MS = 5 * 60_000;
export function assertConnectionsEnabled() {
  if (!channelConnectionsEnabled()) throw new UserError("Las conexiones por cuenta están en pausa");
}
export const connectionInput = z.object({
  channel: z.enum(INBOX_CHANNELS), label: z.string().trim().min(1).max(80),
  externalAccountKey: z.string().trim().min(1).max(200),
  // A reference to an existing server-side n8n credential, never a token/URL.
  credentialRef: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
}).strict();
export function effectiveConnectionState(row: Pick<ChannelConnection, "enabled" | "state" | "checkedAt" | "providerVerified" | "canReceive" | "canSend">, now = new Date()) {
  if (!row.enabled) return "PAUSED" as const;
  if (!row.checkedAt || now.getTime() - row.checkedAt.getTime() > HEALTH_TTL_MS) return "STALE" as const;
  if (!row.providerVerified) return "UNVERIFIED" as const;
  return row.state === "HEALTHY" && (!row.canReceive || !row.canSend) ? "DEGRADED" as const : row.state;
}
export async function lockConnection(tx: Prisma.TransactionClient, organizationId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM "ChannelConnection" WHERE id = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`;
  const connection = await tx.channelConnection.findFirst({ where: { id, organizationId }, include: { route: { include: { agent: true } } } });
  if (!connection) throw new UserError("Conexión no encontrada");
  return connection;
}
export async function assertRoutable(tx: Prisma.TransactionClient, organizationId: string, id: string, channel: string, send = false) {
  assertConnectionsEnabled();
  const row = await tx.channelConnection.findFirst({ where: { id, organizationId }, include: { route: { include: { agent: true } } } });
  if (!row || row.channel !== channel || effectiveConnectionState(row) !== "HEALTHY" || !row.canReceive || (send && !row.canSend)) throw new UserError("La conexión no está disponible; verifica la cuenta antes de responder");
  const org = await tx.organization.findFirst({ where: { id: organizationId, isActive: true }, select: { id: true } });
  const entitlement = await tx.organizationModule.findFirst({ where: { organizationId, module: { in: ["CRM", "AI_WHATSAPP"] }, status: "ACTIVE" }, select: { id: true } });
  if (!org || !entitlement) throw new UserError("Organización o módulo inactivo");
  return row;
}
export async function connectionAiAllowed(tx: Prisma.TransactionClient, organizationId: string, conv: { channelConnectionId: string | null; channel: string }) {
  if (!conv.channelConnectionId) return true;
  try {
    const row = await assertRoutable(tx, organizationId, conv.channelConnectionId, conv.channel, true);
    if (!await tx.organizationModule.findFirst({ where: { organizationId, module: "AI_WHATSAPP", status: "ACTIVE" }, select: { id: true } })) return false;
    if (!row.route?.enabled || row.route.agent.status !== "LEGACY" || row.route.agent.definitionKey !== "legacy-assistant") return false;
    return !!await tx.whatsAppAssistant.findFirst({ where: { organizationId, id: row.route.agent.legacyAssistantId ?? "", isActive: true }, select: { id: true } });
  } catch (error) {
    if (error instanceof UserError) return false;
    throw error;
  }
}
export async function createConnection(organizationId: string, actorId: string, input: z.infer<typeof connectionInput>) {
  assertConnectionsEnabled(); const data = connectionInput.parse(input);
  return prisma.$transaction(async tx => {
    const row = await tx.channelConnection.create({ data: { organizationId, ...data } });
    await tx.auditLog.create({ data: { organizationId, userId: actorId, action: "channel_connection.register", resource: "ChannelConnection", resourceId: row.id } });
    return { id: row.id, version: row.version };
  });
}
export async function configureConnection(organizationId: string, actorId: string, input: { id: string; expectedVersion: number; enabled: boolean; agentInstanceId?: string | null; resetVerification?: boolean }) {
  assertConnectionsEnabled();
  if (input.resetVerification && input.enabled) throw new UserError("Pausa la cuenta antes de reiniciar su verificación");
  return prisma.$transaction(async tx => {
    const row = await lockConnection(tx, organizationId, input.id);
    if (row.version !== input.expectedVersion) throw new UserError("La conexión cambió; recarga antes de guardar");
    if (input.enabled && (!row.providerVerified || !row.checkedAt || Date.now() - row.checkedAt.getTime() > HEALTH_TTL_MS || row.state !== "HEALTHY" || !row.canReceive || !row.canSend)) throw new UserError("El conector debe verificar primero esta cuenta y sus capacidades");
    if (input.agentInstanceId) {
      const agent = await tx.agentInstance.findFirst({ where: { id: input.agentInstanceId, organizationId, status: "LEGACY", definitionKey: "legacy-assistant" } });
      if (!agent || !await tx.whatsAppAssistant.findFirst({ where: { id: agent.legacyAssistantId ?? "", organizationId, isActive: true }, select: { id: true } })) throw new UserError("Asistente no disponible");
      await tx.channelRouting.upsert({ where: { connectionId: row.id }, create: { organizationId, connectionId: row.id, agentInstanceId: agent.id }, update: { agentInstanceId: agent.id, enabled: true, version: { increment: 1 } } });
    }
    if (input.agentInstanceId === null) await tx.channelRouting.updateMany({ where: { organizationId, connectionId: row.id }, data: { enabled: false, version: { increment: 1 } } });
    const updated = await tx.channelConnection.update({ where: { id: row.id }, data: { enabled: input.enabled, version: { increment: 1 }, ...(!input.enabled && (row.enabled || input.resetVerification) ? { generation: { increment: 1 }, state: "UNVERIFIED", providerVerified: false, checkedAt: null, canReceive: false, canSend: false, healthSequence: 0 } : {}) } });
    await tx.auditLog.create({ data: { organizationId, userId: actorId, action: "channel_connection.configure", resource: "ChannelConnection", resourceId: row.id, metadata: { enabled: input.enabled, version: updated.version, generation: updated.generation, routeUpdated: input.agentInstanceId !== undefined, agentInstanceId: input.agentInstanceId ?? null, resetVerification: !!input.resetVerification } } });
    return { id: updated.id, version: updated.version };
  });
}

/** Explicit reviewed adoption only: retain the historical ID/messages, never guess an account from a phone. */
export async function bindLegacyConversation(organizationId: string, actorId: string, input: { connectionId: string; conversationId: string; externalThreadId: string; expectedUpdatedAt: Date }) {
  assertConnectionsEnabled();
  return prisma.$transaction(async tx => {
    // Same order as send admission: conversation first, then account.
    await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${input.conversationId} AND "organizationId" = ${organizationId} FOR UPDATE`;
    const conv = await tx.conversation.findFirst({ where: { id: input.conversationId, organizationId } });
    if (!conv || conv.channelConnectionId || conv.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) throw new UserError("El historial cambió o ya está vinculado; recarga y revisa la conversación");
    const connection = await lockConnection(tx, organizationId, input.connectionId);
    await assertRoutable(tx, organizationId, connection.id, conv.channel);
    if (await tx.message.count({ where: { conversationId: conv.id, deliveryStatus: "PENDING" } }) || await tx.webhookEvent.count({ where: { organizationId, source: AUTO_JOB_SOURCE, OR: [{ status: { in: ["PENDING", "PROCESSING"] } }, { status: "FAILED", attempts: { lt: AUTO_JOB_MAX_ATTEMPTS } }], payload: { path: ["conversationId"], equals: conv.id } } })) throw new UserError("Revisa los mensajes y trabajos pendientes antes de vincular el historial");
    await tx.conversation.update({ where: { id: conv.id }, data: { channelConnectionId: connection.id, externalThreadId: input.externalThreadId } });
    await tx.auditLog.create({ data: { organizationId, userId: actorId, action: "channel_connection.bind_history", resource: "Conversation", resourceId: conv.id, metadata: { connectionId: connection.id } } });
    return { conversationId: conv.id };
  });
}
