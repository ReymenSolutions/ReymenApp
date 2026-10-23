import type { Prisma } from "@prisma/client";
import { triggerN8nWorkflow } from "@/lib/n8n";
import { outboundWorkflowPath } from "@/lib/channels";
import { assertRoutable, lockConnection } from "./service";
import { UserError } from "@/lib/user-error";

/** Caller owns the connection lock until transport admission completes; pause cannot race admission. */
export async function sendConversationOutbound(tx: Prisma.TransactionClient, organizationId: string, conv: { id: string; channel: string; channelConnectionId: string | null }, messageId: string, data: Record<string, unknown>) {
  if (await tx.markChatPilot.findFirst({ where: { organizationId, conversationId: conv.id }, select: { id: true } })) throw new UserError("El piloto privado usa su propio envío revisado");
  if (!conv.channelConnectionId) return triggerN8nWorkflow(outboundWorkflowPath(conv.channel), { organizationId, event: "message.send", data });
  await lockConnection(tx, organizationId, conv.channelConnectionId);
  const connection = await assertRoutable(tx, organizationId, conv.channelConnectionId, conv.channel, true);
  if (data.attachmentUrl || data.attachmentType) throw new UserError("Esta conexión admite solo texto por el momento");
  const message = await tx.message.findFirst({ where: { id: messageId, conversationId: conv.id, role: { in: ["AGENT", "ASSISTANT"] } }, select: { id: true } });
  if (!message) throw new UserError("Mensaje no encontrado");
  await tx.message.update({ where: { id: messageId }, data: { metadata: { channelGeneration: connection.generation } } });
  return triggerN8nWorkflow("channel-outbound-v1", {
    organizationId, event: "message.send",
    data: { ...data, version: 1, connectionId: connection.id, externalAccountKey: connection.externalAccountKey, credentialRef: connection.credentialRef, generation: connection.generation, idempotencyKey: messageId },
  });
}
