"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { assertInboxAccess } from "@/lib/inbox";
import { draftsAvailable } from "@/lib/ai-draft";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";
import type { Message, UserRole } from "@prisma/client";

const THREAD_PAGE = 50;

async function requireInbox() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  await assertInboxAccess(session.user.organizationId);
  return session as typeof session & { user: { organizationId: string } };
}

export type InboxThread = {
  conversation: {
    id: string;
    channel: string;
    status: "OPEN" | "ESCALATED" | "RESOLVED" | "CLOSED";
    aiHandled: boolean;
    contactName: string | null;
    contactPhone: string | null;
    contactHandle: string | null;
    contactEmail: string | null;
    subject: string | null;
    important: boolean;
    archived: boolean;
    leadId: string | null;
    assignedTo: { id: string; name: string | null; email: string } | null;
  };
  messages: (Message & { sender: { name: string | null; email: string } | null })[];
  hasMore: boolean;
  canReply: boolean;
  canAssign: boolean;
  /** La IA puede sugerir un borrador (módulo, clave de Claude e interruptor del negocio). */
  aiDrafts: boolean;
  teamUsers: { id: string; name: string | null; email: string }[];
};

/**
 * Abre un hilo del inbox: sus últimos mensajes y los datos para atenderlo. Abrirlo lo marca como leído.
 * Siempre acotado a la organización de la sesión.
 */
export async function openInboxThread(conversationId: string): Promise<InboxThread> {
  const session = await requireInbox();
  const orgId = session.user.organizationId;
  const conv = await prisma.conversation.findFirst({
    where: { id: conversationId, organizationId: orgId },
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: THREAD_PAGE + 1, include: { sender: { select: { name: true, email: true } } } },
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });
  if (!conv) throw new UserError("Conversación no encontrada");

  if (conv.unreadCount > 0) {
    await prisma.conversation.update({ where: { id: conv.id }, data: { unreadCount: 0 }, select: { id: true } });
  }
  const teamUsers = await prisma.user.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true, email: true }, orderBy: { createdAt: "asc" } });
  const role = session.user.role as UserRole;
  const hasMore = conv.messages.length > THREAD_PAGE;
  const messages = conv.messages.slice(0, THREAD_PAGE).reverse();

  return {
    conversation: {
      id: conv.id,
      channel: conv.channel,
      status: conv.status,
      aiHandled: conv.aiHandled,
      contactName: conv.contactName,
      contactPhone: conv.contactPhone,
      contactHandle: conv.contactHandle,
      contactEmail: conv.contactEmail,
      subject: conv.subject,
      important: conv.important,
      archived: conv.archivedAt !== null,
      leadId: conv.leadId,
      assignedTo: conv.assignedTo,
    },
    messages,
    hasMore,
    canReply: can(role, "conversations:reply") && conv.status !== "RESOLVED" && conv.status !== "CLOSED",
    canAssign: can(role, "conversations:assign"),
    aiDrafts: await draftsAvailable(orgId),
    teamUsers,
  };
}

async function ownedConversation(conversationId: string) {
  const session = await requireInbox();
  if (!can(session.user.role as UserRole, "conversations:reply")) throw new UserError("No autorizado");
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, organizationId: session.user.organizationId } });
  if (!conv) throw new UserError("Conversación no encontrada");
  return { session, conv };
}

/** Archiva una conversación (sale de la bandeja de entrada) o la regresa a ella. */
export async function setConversationArchived(conversationId: string, archived: boolean) {
  const { session, conv } = await ownedConversation(conversationId);
  await prisma.conversation.update({ where: { id: conv.id }, data: { archivedAt: archived ? new Date() : null } });
  await logAudit({ organizationId: session.user.organizationId, userId: session.user.id, action: archived ? "conversation.archive" : "conversation.unarchive", resource: "Conversation", resourceId: conv.id });
  revalidatePath("/portal/inbox");
  return { success: true };
}

/** Marca o desmarca una conversación como importante. */
export async function setConversationImportant(conversationId: string, important: boolean) {
  const { conv } = await ownedConversation(conversationId);
  await prisma.conversation.update({ where: { id: conv.id }, data: { important } });
  revalidatePath("/portal/inbox");
  return { success: true };
}

/** La deja como no leída (para volver a ella). */
export async function markConversationUnread(conversationId: string) {
  const { conv } = await ownedConversation(conversationId);
  await prisma.conversation.update({ where: { id: conv.id }, data: { unreadCount: Math.max(1, conv.unreadCount) } });
  revalidatePath("/portal/inbox");
  return { success: true };
}
