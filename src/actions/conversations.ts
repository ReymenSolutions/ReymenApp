"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notifyAdmins } from "@/lib/admin-notifications";
import { escalationAlertEmail } from "@/lib/email-templates";
import { assertModuleEnabled } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { triggerN8nWorkflow } from "@/lib/n8n";
import { recordMetric, METRIC_KEYS } from "@/lib/metrics";
import type { UserRole } from "@prisma/client";
import { appUrl } from "@/lib/app-url";
import { UserError } from "@/lib/user-error";
import { assertInboxAccess } from "@/lib/inbox";
import { markReplyDraftUsed } from "@/lib/ai-draft";
import { outboundWorkflowPath, messagePreview } from "@/lib/channels";

async function requireOrgAndWhatsapp() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  await assertInboxAccess(session.user.organizationId);
  return session;
}

export async function escalateConversation(conversationId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  await assertModuleEnabled(session.user.organizationId, "AI_WHATSAPP");

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: session.user.organizationId },
    include: { organization: { select: { name: true } } },
  });
  if (!conv) throw new UserError("Conversación no encontrada");
  if (conv.status !== "OPEN") throw new UserError("Solo se pueden escalar conversaciones abiertas");

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "ESCALATED", escalatedAt: new Date(), aiHandled: false },
  });
  await recordMetric(session.user.organizationId, METRIC_KEYS.CONVERSATIONS_ESCALATED);

  const adminUrl = appUrl("/admin/escalations");
  const email = escalationAlertEmail(conv.organization.name, conv.contactName ?? conv.contactPhone ?? "Un contacto", adminUrl);
  await notifyAdmins(email);

  revalidatePath(`/portal/conversations/${conversationId}`);
  revalidatePath("/portal/conversations");
  revalidatePath("/portal/whatsapp");
  return { success: true };
}

const MESSAGE_PAGE_SIZE = 50;

/** Fetches the page of messages immediately before `beforeMessageId`, oldest of that page first. */
export async function getOlderMessages(conversationId: string, beforeMessageId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  await assertModuleEnabled(session.user.organizationId, "AI_WHATSAPP");

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: session.user.organizationId },
    select: { id: true },
  });
  if (!conv) throw new UserError("Conversación no encontrada");

  const cursor = await prisma.message.findUnique({
    where: { id: beforeMessageId },
    select: { createdAt: true },
  });
  if (!cursor) throw new UserError("Mensaje no encontrado");

  const older = await prisma.message.findMany({
    where: {
      conversationId,
      // Compound cursor (createdAt, id) rather than createdAt alone, so two
      // messages sharing the same millisecond timestamp never get skipped.
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: beforeMessageId } },
      ],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MESSAGE_PAGE_SIZE,
    include: { sender: { select: { name: true, email: true } } },
  });

  return { messages: older.reverse(), hasMore: older.length === MESSAGE_PAGE_SIZE };
}

export async function resolveConversation(conversationId: string) {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");

  await assertModuleEnabled(session.user.organizationId, "AI_WHATSAPP");

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: session.user.organizationId },
  });
  if (!conv) throw new UserError("Conversación no encontrada");

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  revalidatePath(`/portal/conversations/${conversationId}`);
  revalidatePath("/portal/conversations");
  revalidatePath("/portal/whatsapp");
  return { success: true };
}

/**
 * Sends a manual reply from the portal. The platform never talks to the
 * WhatsApp Business API directly — it stores the message and hands the
 * actual send off to n8n (see docs/DOCUMENTACION_TECNICA.md §8), which
 * reports delivery status back via the message.status webhook. Sending
 * implicitly takes human control (aiHandled=false) and claims the
 * conversation for the caller if nobody has it yet, so the bot doesn't
 * keep auto-replying underneath a human who just answered.
 */
export async function sendManualMessage(data: {
  conversationId: string;
  content: string;
  attachmentUrl?: string;
  attachmentType?: string;
  /** Borrador de IA del que parte esta respuesta (se registra qué se envió finalmente). */
  draftId?: string;
}) {
  const session = await requireOrgAndWhatsapp();
  if (!can(session.user.role as UserRole, "conversations:reply")) throw new UserError("No autorizado");

  const content = data.content.trim();
  if (!content && !data.attachmentUrl) throw new UserError("El mensaje no puede estar vacío");

  const conv = await prisma.conversation.findFirst({
    where: { id: data.conversationId, organizationId: session.user.organizationId! },
  });
  if (!conv) throw new UserError("Conversación no encontrada");
  if (conv.status === "RESOLVED" || conv.status === "CLOSED") {
    throw new UserError("No se puede responder a una conversación cerrada");
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conv.id,
      role: "AGENT",
      content: content || "(adjunto)",
      senderId: session.user.id,
      attachmentUrl: data.attachmentUrl,
      attachmentType: data.attachmentType,
      deliveryStatus: "PENDING",
    },
  });

  await prisma.conversation.update({
    where: { id: conv.id },
    data: {
      aiHandled: false,
      assignedToId: conv.assignedToId ?? session.user.id,
      lastMessageAt: new Date(),
      lastMessagePreview: messagePreview(content || "(adjunto)"),
      lastMessageRole: "AGENT",
      unreadCount: 0,
    },
  });
  await recordMetric(session.user.organizationId!, METRIC_KEYS.MESSAGES_SENT);

  const trigger = await triggerN8nWorkflow(outboundWorkflowPath(conv.channel), {
    organizationId: session.user.organizationId!,
    event: "message.send",
    data: {
      conversationId: conv.id,
      messageId: message.id,
      contactPhone: conv.contactPhone,
      contactHandle: conv.contactHandle,
      contactEmail: conv.contactEmail,
      subject: conv.subject,
      channel: conv.channel,
      content,
      attachmentUrl: data.attachmentUrl,
      attachmentType: data.attachmentType,
    },
  });

  const finalMessage = trigger.success
    ? message
    : await prisma.message.update({ where: { id: message.id }, data: { deliveryStatus: "FAILED" } });

  if (data.draftId) await markReplyDraftUsed(session.user.organizationId!, data.draftId, session.user.id, content);

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "conversation.manual_message",
    resource: "Conversation",
    resourceId: conv.id,
    metadata: { messageId: message.id, delivered: trigger.success },
  });

  revalidatePath(`/portal/conversations/${conv.id}`);
  revalidatePath("/portal/conversations");
  revalidatePath("/portal/whatsapp");
  return {
    success: true,
    delivered: trigger.success,
    message: { ...finalMessage, sender: { name: session.user.name ?? null, email: session.user.email } },
  };
}

/** A human agent takes over from the AI assistant, claiming the conversation if nobody else has it. */
export async function takeHumanControl(conversationId: string) {
  const session = await requireOrgAndWhatsapp();
  if (!can(session.user.role as UserRole, "conversations:reply")) throw new UserError("No autorizado");

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: session.user.organizationId! },
  });
  if (!conv) throw new UserError("Conversación no encontrada");

  if (conv.assignedToId && conv.assignedToId !== session.user.id) {
    if (!can(session.user.role as UserRole, "conversations:assign")) {
      throw new UserError("Esta conversación ya está siendo atendida por otro agente");
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { aiHandled: false, assignedToId: session.user.id },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "conversation.take_control",
    resource: "Conversation",
    resourceId: conversationId,
  });

  revalidatePath(`/portal/conversations/${conversationId}`);
  revalidatePath("/portal/conversations");
  return { success: true };
}

/** Hands the conversation back to the AI assistant and clears the human assignment. */
export async function releaseToAI(conversationId: string) {
  const session = await requireOrgAndWhatsapp();
  if (!can(session.user.role as UserRole, "conversations:reply")) throw new UserError("No autorizado");

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: session.user.organizationId! },
  });
  if (!conv) throw new UserError("Conversación no encontrada");

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { aiHandled: true, assignedToId: null },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "conversation.release_to_ai",
    resource: "Conversation",
    resourceId: conversationId,
  });

  revalidatePath(`/portal/conversations/${conversationId}`);
  revalidatePath("/portal/conversations");
  return { success: true };
}

/** Assigns (or unassigns, with userId=null) a conversation to a specific teammate. */
export async function assignConversation(conversationId: string, userId: string | null) {
  const session = await requireOrgAndWhatsapp();
  if (!can(session.user.role as UserRole, "conversations:assign")) throw new UserError("No autorizado");

  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: session.user.organizationId! },
  });
  if (!conv) throw new UserError("Conversación no encontrada");

  if (userId) {
    const target = await prisma.user.findFirst({
      where: { id: userId, organizationId: session.user.organizationId, isActive: true },
    });
    if (!target) throw new UserError("Usuario no encontrado");
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { assignedToId: userId, aiHandled: userId ? false : conv.aiHandled },
  });

  await logAudit({
    organizationId: session.user.organizationId,
    userId: session.user.id,
    action: "conversation.assign",
    resource: "Conversation",
    resourceId: conversationId,
    metadata: { assignedToId: userId },
  });

  revalidatePath(`/portal/conversations/${conversationId}`);
  revalidatePath("/portal/conversations");
  return { success: true };
}
