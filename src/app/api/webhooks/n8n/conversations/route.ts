import { createOrgWebhookHandler } from "@/lib/org-webhook-route";
import { processConversationEvent } from "@/lib/webhook-processors";
import { getChannelMode } from "@/lib/agent-mode";
import { prisma } from "@/lib/prisma";
import { scheduleAutoReply } from "@/lib/ai-auto-reply";

export const POST = createOrgWebhookHandler({
  rateLimitKey: "conversations",
  source: "n8n",
  eventType: "conversation.message",
  // Además de guardar el mensaje, se le dice a n8n qué modo tiene el Agente IA en ese canal (off | suggest | auto)
  // para que los flujos que contestan por su cuenta respeten el "Apagado".
  process: async (payload, orgId) => {
    const { conversationId } = await processConversationEvent(payload, orgId);
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { channel: true } });
    const aiMode = (await getChannelMode(orgId, conv?.channel ?? "whatsapp")).toLowerCase();
    // Canal en Automático: el agente contesta el mensaje del cliente después de responderle a n8n.
    if (aiMode === "auto" && (payload as { message?: { role?: string } }).message?.role === "USER") scheduleAutoReply(orgId, conversationId);
    return { conversationId, aiMode };
  },
  successBody: (result) => ({ conversationId: result.conversationId, aiMode: result.aiMode }),
});
