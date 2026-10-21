import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { processConversationEvent } from "@/lib/webhook-processors";
import { assertConnectionsEnabled, assertRoutable, HEALTH_TTL_MS, lockConnection } from "./service";
const text = z.string().trim().min(1).max(200);
const base = { version: z.literal(1), connectionId: text, externalAccountKey: text, generation: z.number().int().positive(), eventId: text };
export const channelEventSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("health"), sequence: z.number().int().min(1).max(2147483647), observedAt: z.string().datetime(), state: z.enum(["HEALTHY", "DEGRADED", "DISCONNECTED"]), providerVerified: z.boolean(), canReceive: z.boolean(), canSend: z.boolean(), outboundContractVersion: z.literal(1) }).strict(),
  z.object({ ...base, type: z.literal("message"), externalThreadId: text, contactPhone: text.optional(), contactHandle: text.optional(), contactEmail: z.string().email().max(254).optional(), contactName: z.string().max(200).optional(), subject: z.string().max(200).optional(), message: z.object({ externalId: text, content: z.string().min(1).max(16000) }).strict() }).strict(),
  z.object({ ...base, type: z.literal("status"), messageId: text, status: z.enum(["SENT", "DELIVERED", "READ", "FAILED"]) }).strict(),
]).superRefine((event, ctx) => {
  if (event.type === "message" && event.eventId !== event.message.externalId) ctx.addIssue({ code: "custom", message: "message eventId must equal the stable provider message ID" });
});
export type ChannelEvent = z.infer<typeof channelEventSchema>;

/** Also used by durable retries: recheck current account/generation and feature gate. */
export async function processChannelEvent(payload: unknown, organizationId: string) {
  assertConnectionsEnabled();
  const event = channelEventSchema.parse(payload);
  if (!await prisma.organization.findFirst({ where: { id: organizationId, isActive: true }, select: { id: true } }) || !await prisma.organizationModule.findFirst({ where: { organizationId, module: { in: ["CRM", "AI_WHATSAPP"] }, status: "ACTIVE" }, select: { id: true } })) throw new Error("Inactive organization or module");
  const row = await prisma.channelConnection.findFirst({ where: { id: event.connectionId, organizationId, externalAccountKey: event.externalAccountKey, ...(event.type !== "status" ? { generation: event.generation } : {}) } });
  if (!row) throw new Error("Invalid channel account or generation");
  if (event.type === "health") {
    const observed = new Date(event.observedAt), age = Date.now() - observed.getTime();
    if (age < -30_000 || age > HEALTH_TTL_MS) throw new Error("Expired health observation");
    await prisma.$transaction(async tx => {
      const current = await lockConnection(tx, organizationId, row.id);
      if (current.generation !== event.generation) throw new Error("Invalid channel generation");
      if (event.sequence <= current.healthSequence || (current.checkedAt && observed < current.checkedAt)) return;
      if (event.providerVerified) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('channel-account-owner'), hashtext(${`${current.channel}:${current.externalAccountKey}`}))`;
        if (await tx.channelConnection.findFirst({ where: { channel: current.channel, externalAccountKey: current.externalAccountKey, providerVerified: true, organizationId: { not: organizationId } }, select: { id: true } })) throw new Error("Provider account already assigned; operator review required");
      }
      await tx.channelConnection.update({ where: { id: row.id }, data: { state: event.state, healthSequence: event.sequence, checkedAt: observed, providerVerified: event.providerVerified, canReceive: event.canReceive, canSend: event.canSend } });
    });
    return { recorded: true };
  }
  if (event.type === "status") {
    // Late acknowledgements remain valid while paused/unhealthy; they never authorize another send.
    await prisma.$transaction(async tx => {
      await lockConnection(tx, organizationId, row.id);
      await tx.$queryRaw`SELECT m.id FROM "Message" m JOIN "Conversation" c ON c.id = m."conversationId" WHERE m.id = ${event.messageId} AND c."organizationId" = ${organizationId} AND c."channelConnectionId" = ${row.id} FOR UPDATE OF m`;
      const message = await tx.message.findFirst({ where: { id: event.messageId, role: { in: ["AGENT", "ASSISTANT"] }, conversation: { organizationId, channelConnectionId: row.id } } });
      if (!message || (message.metadata as { channelGeneration?: number } | null)?.channelGeneration !== event.generation) throw new Error("Outbound message not found");
      const rank: Record<string, number> = { PENDING: 0, FAILED: 0, SENT: 1, DELIVERED: 2, READ: 3 };
      if ((rank[event.status] ?? 0) < (rank[message.deliveryStatus ?? "PENDING"] ?? 0)) return;
      await tx.message.update({ where: { id: message.id }, data: { deliveryStatus: event.status } });
    });
    return { recorded: true };
  }
  await prisma.$transaction(tx => assertRoutable(tx, organizationId, row.id, row.channel));
  const result = await processConversationEvent({ ...event, channel: row.channel, message: { ...event.message, role: "USER" } }, organizationId, { connectionId: row.id, externalThreadId: event.externalThreadId, generation: event.generation });
  // Jobs are durable; the existing cron is the sole recovery mechanism. No second runtime.
  return result;
}
