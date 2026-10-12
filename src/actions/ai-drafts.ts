"use server";

import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertInboxAccess } from "@/lib/inbox";
import { dismissReplyDraft as dismiss, getOrCreateReplyDraft, type DraftState } from "@/lib/ai-draft";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";
import type { UserRole } from "@prisma/client";

async function requireReplier() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  if (!can(session.user.role as UserRole, "conversations:reply")) throw new UserError("No autorizado");
  await assertInboxAccess(session.user.organizationId);
  return session as typeof session & { user: { organizationId: string } };
}

/**
 * Borrador de IA para el último mensaje del cliente: el que ya existe o uno nuevo. Solo para quien puede
 * responder, y solo de conversaciones de su organización. Si la IA no está disponible devuelve "off".
 */
export async function requestReplyDraft(conversationId: string): Promise<DraftState> {
  const session = await requireReplier();
  return getOrCreateReplyDraft(session.user.organizationId, conversationId);
}

/** Pide otra versión del borrador. */
export async function regenerateReplyDraft(conversationId: string): Promise<DraftState> {
  const session = await requireReplier();
  const state = await getOrCreateReplyDraft(session.user.organizationId, conversationId, { force: true });
  await logAudit({ organizationId: session.user.organizationId, userId: session.user.id, action: "ai_draft.regenerate", resource: "Conversation", resourceId: conversationId });
  return state;
}

/** Descarta el borrador (la persona escribirá su propia respuesta). */
export async function dismissReplyDraft(draftId: string) {
  const session = await requireReplier();
  const ok = await dismiss(session.user.organizationId, draftId);
  if (!ok) throw new UserError("Borrador no encontrado");
  return { success: true };
}
