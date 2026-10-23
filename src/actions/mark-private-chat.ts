"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAiManager, requireOrgPermission } from "@/lib/guards";
import { createPrivateChat, controlPrivateChat, generatePrivateChatDraft, readPrivateChatOperator, recoverPrivateChat, sendPrivateChatReply, renewPrivateChatLink } from "@/lib/ai/pilot/chat";
const id = z.string().min(1).max(128);
function refresh(conversationId: string) { revalidatePath(`/portal/conversations/${conversationId}`); revalidatePath("/portal/conversations"); }
export async function createMarkChat(raw: { requestKey: string; confirmFictional: boolean }) {
  const s = await requireAiManager();
  return createPrivateChat(s.user.organizationId, s.user.id, raw);
}
export async function getMarkChat(conversationId: string) {
  const s = await requireOrgPermission("conversations:view");
  return readPrivateChatOperator(s.user.organizationId, s.user.id, id.parse(conversationId));
}
export async function generateMarkChat(raw: { conversationId: string; basedOnMessageId: string; confirmCost: boolean; confirmFictional: boolean }) {
  const s = await requireAiManager();
  const input = z.object({ conversationId: id, basedOnMessageId: id, confirmCost: z.literal(true), confirmFictional: z.literal(true) }).strict().parse(raw);
  const result = await generatePrivateChatDraft(s.user.organizationId, s.user.id, input.conversationId, input.basedOnMessageId, input.confirmCost);
  refresh(input.conversationId); return result;
}
export async function renewMarkChatLink(conversationId: string) {
  const s = await requireAiManager();
  const result = await renewPrivateChatLink(s.user.organizationId, s.user.id, id.parse(conversationId)); refresh(conversationId); return result;
}
export async function replyMarkChat(raw: { conversationId: string; content: string; requestKey: string; draftId?: string }) {
  const s = await requireOrgPermission("conversations:reply");
  const result = await sendPrivateChatReply(s.user.organizationId, s.user.id, raw);
  refresh(raw.conversationId); return { success: result.success };
}
export async function controlMarkChat(raw: { conversationId: string; action: "take" | "release" | "resolve" | "revoke" }) {
  const s = await requireOrgPermission("conversations:reply");
  const input = z.object({ conversationId: id, action: z.enum(["take", "release", "resolve", "revoke"]) }).strict().parse(raw);
  const result = await controlPrivateChat(s.user.organizationId, s.user.id, input.conversationId, input.action);
  refresh(input.conversationId); return result;
}
export async function recoverMarkChat(conversationId: string) {
  const s = await requireAiManager();
  const result = await recoverPrivateChat(s.user.organizationId, s.user.id, id.parse(conversationId));
  refresh(conversationId); return result;
}
