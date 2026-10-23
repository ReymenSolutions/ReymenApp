import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type Action } from "@/lib/permissions";
import { appUrl } from "@/lib/app-url";
import { messagePreview } from "@/lib/channels";
import { customerNeedsHuman } from "@/lib/ai/human-request";
import { assertPrivateReviewSources, runPrivateMarkReview } from "./review";
import { lockPilotBudget } from "./budget";

type Tx = Prisma.TransactionClient;
export const privateChatEnabled = () => process.env.REYMEN_STAGING === "true" && process.env.AI_MARK_PRIVATE_CHAT_ENABLED === "true";
function gate() { if (!privateChatEnabled()) throw new Error("pilot_chat_disabled"); }
const id = z.string().min(1).max(128), text = z.string().trim().min(1).max(500);
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
async function authority(tx: Tx, organizationId: string, actorId: string, action: Action) {
  const user = await tx.user.findFirst({ where: { id: actorId, organizationId, isActive: true, organization: { isActive: true } }, select: { id: true, role: true } });
  const entitlement = await tx.organizationModule.findUnique({ where: { organizationId_module: { organizationId, module: "AI_WHATSAPP" } } });
  if (!user || !can(user.role, action) || entitlement?.status !== "ACTIVE") throw new Error("pilot_chat_forbidden");
  return user;
}
async function locked(tx: Tx, organizationId: string, conversationId: string, live = true) {
  gate();
  await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id=${conversationId} AND "organizationId"=${organizationId} FOR UPDATE`;
  const pilot = await tx.markChatPilot.findFirst({ where: { organizationId, conversationId }, include: { conversation: true } });
  if (!pilot || pilot.conversation.channel !== "webchat" || live && (!pilot.active || pilot.expiresAt <= new Date())) throw new Error("pilot_chat_unavailable");
  return pilot;
}
async function dismiss(tx: Tx, organizationId: string, conversationId: string, reason: string) {
  await tx.replyDraft.updateMany({ where: { organizationId, conversationId, status: { in: ["GENERATING", "READY"] } }, data: { status: "DISMISSED", content: "", error: reason } });
}
async function latest(tx: Tx, conversationId: string) {
  return tx.message.findFirst({ where: { conversationId, role: { in: ["USER", "AGENT", "ASSISTANT"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
}
// Transactions may begin before waiting for the row lock. Assign message times after
// acquiring it so a late transaction cannot hide the newest customer turn.
async function messageTime(tx: Tx, conversationId: string) {
  const previous = await latest(tx, conversationId);
  return new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1));
}
async function audit(tx: Tx, organizationId: string, conversationId: string, action: string, userId?: string) {
  await tx.auditLog.create({ data: { organizationId, userId, resource: "Conversation", resourceId: conversationId, action } });
}
export async function isPrivateChat(organizationId: string, conversationId: string) {
  return !!await prisma.markChatPilot.findFirst({ where: { organizationId, conversationId }, select: { id: true } });
}
/** Also protects the read-only history when the chat feature is switched off. */
export async function assertPrivateChatViewer(organizationId: string, actorId: string) {
  await prisma.$transaction(tx => authority(tx, organizationId, actorId, "conversations:view"));
}

export async function createPrivateChat(organizationId: string, actorId: string, raw: { requestKey: string; confirmFictional: boolean }) {
  gate(); const input = z.object({ requestKey: z.string().uuid(), confirmFictional: z.literal(true) }).strict().parse(raw);
  const token = randomBytes(32).toString("base64url");
  return prisma.$transaction(async tx => {
    await authority(tx, organizationId, actorId, "knowledge_base:manage");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"mark-chat-create:" + organizationId}))`;
    const previous = await tx.markChatPilot.findFirst({ where: { organizationId, createdById: actorId, requestKey: input.requestKey } });
    if (previous) return { conversationId: previous.conversationId, visitorUrl: null };
    if (await tx.markChatPilot.count({ where: { organizationId, createdAt: { gte: new Date(Date.now() - 3600000) } } }) >= 10) throw new Error("pilot_chat_creation_limit");
    const conversation = await tx.conversation.create({ data: { organizationId, channel: "webchat", contactName: "Visitante del piloto privado", contactHandle: `mark-private:${randomUUID()}`, aiHandled: true } });
    await tx.markChatPilot.create({ data: { organizationId, conversationId: conversation.id, createdById: actorId, requestKey: input.requestKey, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600000) } });
    await audit(tx, organizationId, conversation.id, "ai.mark_chat.create", actorId);
    return { conversationId: conversation.id, visitorUrl: `${appUrl("/mark-chat")}#token=${token}` };
  });
}

export async function renewPrivateChatLink(organizationId: string, actorId: string, conversationId: string) {
  const token = randomBytes(32).toString("base64url");
  return prisma.$transaction(async tx => {
    await authority(tx, organizationId, actorId, "knowledge_base:manage");
    const pilot = await locked(tx, organizationId, conversationId, false);
    if (["CLOSED", "RESOLVED"].includes(pilot.conversation.status)) throw new Error("pilot_chat_closed");
    await tx.markChatPilot.update({ where: { id: pilot.id }, data: { active: true, tokenHash: hash(token), createdById: actorId, expiresAt: new Date(Date.now() + 3600000), revision: { increment: 1 } } });
    await dismiss(tx, organizationId, conversationId, "visitor_link_renewed");
    await audit(tx, organizationId, conversationId, "ai.mark_chat.renew_link", actorId);
    return { visitorUrl: `${appUrl("/mark-chat")}#token=${token}` };
  });
}

async function visitor(tx: Tx, token: string) {
  gate(); z.string().regex(/^[A-Za-z0-9_-]{43}$/).parse(token);
  const reference = await tx.markChatPilot.findUnique({ where: { tokenHash: hash(token) }, select: { organizationId: true, conversationId: true } });
  if (!reference) throw new Error("pilot_chat_unavailable");
  const pilot = await locked(tx, reference.organizationId, reference.conversationId);
  await authority(tx, pilot.organizationId, pilot.createdById, "knowledge_base:manage");
  return pilot;
}
export async function readPrivateVisitor(token: string) {
  return prisma.$transaction(async tx => {
    const pilot = await visitor(tx, token);
    const messages = await tx.message.findMany({ where: { conversationId: pilot.conversationId, role: { in: ["USER", "AGENT"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100, select: { id: true, role: true, content: true, createdAt: true } });
    return { status: pilot.conversation.status, human: !pilot.conversation.aiHandled, messages: messages.reverse().map(m => ({ ...m, createdAt: m.createdAt.toISOString() })) };
  });
}
export async function postPrivateVisitor(token: string, raw: { requestKey: string; content: string }) {
  const input = z.object({ requestKey: z.string().uuid(), content: text }).strict().parse(raw);
  return prisma.$transaction(async tx => {
    const pilot = await visitor(tx, token), conv = pilot.conversation;
    const externalId = `mark-visitor:${input.requestKey}`;
    const previous = await tx.message.findUnique({ where: { conversationId_externalId: { conversationId: conv.id, externalId } } });
    if (previous) { if (previous.content !== input.content) throw new Error("pilot_message_key_conflict"); return { id: previous.id }; }
    if (["RESOLVED", "CLOSED"].includes(conv.status)) throw new Error("pilot_chat_closed");
    if (await tx.message.count({ where: { conversationId: conv.id } }) >= 200) throw new Error("pilot_chat_message_limit");
    const message = await tx.message.create({ data: { conversationId: conv.id, role: "USER", content: input.content, externalId, createdAt: await messageTime(tx, conv.id) } });
    const human = customerNeedsHuman(input.content);
    await tx.markChatPilot.update({ where: { id: pilot.id }, data: { revision: { increment: 1 } } });
    await dismiss(tx, pilot.organizationId, conv.id, human ? "customer_requested_human" : "new_customer_message");
    await tx.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: message.createdAt, lastMessagePreview: messagePreview(input.content), lastMessageRole: "USER", unreadCount: { increment: 1 }, ...(human ? { status: "ESCALATED", aiHandled: false, escalatedAt: new Date() } : {}) } });
    if (human) await audit(tx, pilot.organizationId, conv.id, "ai.mark_chat.customer_requested_human");
    return { id: message.id };
  });
}

export async function controlPrivateChat(organizationId: string, actorId: string, conversationId: string, action: "take" | "release" | "resolve" | "escalate" | "assign" | "revoke", targetId?: string | null) {
  id.parse(conversationId);
  return prisma.$transaction(async tx => {
    const user = await authority(tx, organizationId, actorId, action === "assign" ? "conversations:assign" : action === "resolve" || action === "revoke" ? "conversations:resolve" : action === "escalate" ? "conversations:escalate" : "conversations:reply");
    const pilot = await locked(tx, organizationId, conversationId, false), conv = pilot.conversation;
    if (action !== "revoke" && (!pilot.active || pilot.expiresAt <= new Date() || ["CLOSED", "RESOLVED"].includes(conv.status))) throw new Error("pilot_chat_closed");
    if (conv.assignedToId && conv.assignedToId !== actorId && !can(user.role, "conversations:assign")) throw new Error("pilot_chat_assigned_to_other");
    if (action === "assign" && targetId && !await tx.user.findFirst({ where: { id: targetId, organizationId, isActive: true } })) throw new Error("pilot_chat_invalid_assignee");
    await tx.markChatPilot.update({ where: { id: pilot.id }, data: { revision: { increment: 1 }, ...(action === "revoke" ? { active: false } : {}) } });
    await dismiss(tx, organizationId, conv.id, `human_control:${action}`);
    await tx.conversation.update({ where: { id: conv.id }, data: action === "release" ? { aiHandled: true, assignedToId: null, status: "OPEN" } : action === "resolve" || action === "revoke" ? { aiHandled: false, status: "RESOLVED", resolvedAt: new Date() } : action === "escalate" ? { aiHandled: false, status: "ESCALATED", escalatedAt: new Date() } : { aiHandled: false, assignedToId: action === "assign" ? targetId ?? null : actorId } });
    await audit(tx, organizationId, conv.id, `ai.mark_chat.${action}`, actorId);
    return { success: true };
  });
}

export async function generatePrivateChatDraft(organizationId: string, actorId: string, conversationId: string, basedOnMessageId: string, confirmCost: boolean) {
  z.literal(true).parse(confirmCost);
  const claim = await prisma.$transaction(async tx => {
    await authority(tx, organizationId, actorId, "knowledge_base:manage");
    const pilot = await locked(tx, organizationId, conversationId), conv = pilot.conversation;
    if (conv.status !== "OPEN" || !conv.aiHandled || conv.assignedToId) throw new Error("pilot_chat_human_control");
    const inbound = await latest(tx, conv.id);
    if (!inbound || inbound.role !== "USER" || inbound.id !== basedOnMessageId) throw new Error("pilot_chat_no_customer_turn");
    if (customerNeedsHuman(inbound.content)) throw new Error("pilot_chat_human_required");
    const previous = await tx.markChatTurn.findUnique({ where: { conversationId_basedOnMessageId: { conversationId, basedOnMessageId: inbound.id } } });
    if (previous) throw new Error("pilot_chat_turn_already_claimed");
    const draft = await tx.replyDraft.create({ data: { organizationId, conversationId, basedOnMessageId: inbound.id } });
    const turn = await tx.markChatTurn.create({ data: { organizationId, conversationId, basedOnMessageId: inbound.id, draftId: draft.id, generatedById: actorId, requestKey: randomUUID(), expectedRevision: pilot.revision } });
    await audit(tx, organizationId, conv.id, "ai.mark_chat.generate", actorId);
    return { ...turn, question: inbound.content };
  });
  try {
    const result = await runPrivateMarkReview(organizationId, actorId, { requestKey: claim.requestKey, question: claim.question, confirmFictional: true, confirmCost: true }, claim.id);
    return await prisma.$transaction(async tx => {
      await authority(tx, organizationId, actorId, "knowledge_base:manage");
      const pilot = await locked(tx, organizationId, conversationId);
      const current = await tx.replyDraft.findUniqueOrThrow({ where: { id: claim.draftId } });
      if (pilot.revision !== claim.expectedRevision || current.status !== "GENERATING" || !pilot.conversation.aiHandled || pilot.conversation.status !== "OPEN" || pilot.conversation.assignedToId || (await latest(tx, conversationId))?.id !== claim.basedOnMessageId) throw new Error("pilot_chat_turn_changed");
      if (result.kind !== "draft" || !result.text.trim()) {
        await tx.replyDraft.update({ where: { id: claim.draftId }, data: { status: "FAILED", error: result.kind } });
        await tx.conversation.update({ where: { id: conversationId }, data: { status: "ESCALATED", aiHandled: false, escalatedAt: new Date() } });
        await tx.markChatPilot.update({ where: { id: pilot.id }, data: { revision: { increment: 1 } } });
        await audit(tx, organizationId, conversationId, "ai.mark_chat.no_draft", actorId);
        return { success: false };
      }
      await lockPilotBudget(tx, organizationId); await assertPrivateReviewSources(tx, organizationId, result.knowledgeVersion);
      await tx.replyDraft.update({ where: { id: claim.draftId }, data: { status: "READY", content: result.text } });
      await tx.markChatTurn.update({ where: { id: claim.id }, data: { knowledgeVersion: result.knowledgeVersion, sources: result.sources, usageId: result.usageId } });
      return { success: true };
    });
  } catch {
    await prisma.$transaction(async tx => {
      const pilot = await locked(tx, organizationId, conversationId, false);
      const failed = await tx.replyDraft.updateMany({ where: { id: claim.draftId, status: "GENERATING" }, data: { status: "FAILED", content: "", error: "pilot_generation_interrupted" } });
      if (failed.count && pilot.revision === claim.expectedRevision && !["CLOSED", "RESOLVED"].includes(pilot.conversation.status)) {
        await tx.conversation.update({ where: { id: conversationId }, data: { status: "ESCALATED", aiHandled: false, escalatedAt: new Date() } });
        await tx.markChatPilot.update({ where: { id: pilot.id }, data: { revision: { increment: 1 } } });
      }
    }).catch(() => undefined);
    throw new Error("pilot_chat_generation_stopped_review_required");
  }
}

/** Sole private sender: the visitor polls committed AGENT messages; no n8n transport. */
export async function sendPrivateChatReply(organizationId: string, actorId: string, raw: { conversationId: string; content: string; requestKey: string; draftId?: string }) {
  const input = z.object({ conversationId: id, content: z.string().trim().min(1).max(4000), requestKey: z.string().uuid(), draftId: id.optional() }).strict().parse(raw);
  return prisma.$transaction(async tx => {
    const user = await authority(tx, organizationId, actorId, "conversations:reply");
    const pilot = await locked(tx, organizationId, input.conversationId), conv = pilot.conversation;
    const externalId = `mark-reply:${input.requestKey}`;
    const duplicate = await tx.message.findUnique({ where: { conversationId_externalId: { conversationId: conv.id, externalId } }, include: { sender: { select: { name: true, email: true } } } });
    if (duplicate) { if (duplicate.senderId !== actorId || duplicate.content !== input.content) throw new Error("pilot_message_key_conflict"); return { success: true, delivered: true, message: duplicate }; }
    if (["RESOLVED", "CLOSED"].includes(conv.status)) throw new Error("pilot_chat_closed");
    if (conv.assignedToId && conv.assignedToId !== actorId && !can(user.role, "conversations:assign")) throw new Error("pilot_chat_assigned_to_other");
    if (input.draftId) {
      const turn = await tx.markChatTurn.findFirst({ where: { organizationId, conversationId: conv.id, draftId: input.draftId }, include: { draft: true } });
      if (!turn || turn.draft.status !== "READY" || pilot.revision !== turn.expectedRevision || !conv.aiHandled || conv.assignedToId || conv.status !== "OPEN" || (await latest(tx, conv.id))?.id !== turn.basedOnMessageId || turn.knowledgeVersion === null) throw new Error("pilot_chat_draft_stale");
      await lockPilotBudget(tx, organizationId); await assertPrivateReviewSources(tx, organizationId, turn.knowledgeVersion);
      await tx.replyDraft.update({ where: { id: input.draftId }, data: { status: "USED", finalContent: input.content, usedAt: new Date(), usedById: actorId } });
    }
    const message = await tx.message.create({ data: { conversationId: conv.id, role: "AGENT", content: input.content, senderId: actorId, deliveryStatus: "SENT", externalId, createdAt: await messageTime(tx, conv.id) }, include: { sender: { select: { name: true, email: true } } } });
    await dismiss(tx, organizationId, conv.id, "human_reply_sent");
    await tx.markChatPilot.update({ where: { id: pilot.id }, data: { revision: { increment: 1 } } });
    await tx.conversation.update({ where: { id: conv.id }, data: { aiHandled: false, assignedToId: actorId, unreadCount: 0, lastMessageAt: message.createdAt, lastMessagePreview: messagePreview(input.content), lastMessageRole: "AGENT" } });
    await audit(tx, organizationId, conv.id, input.draftId ? "ai.mark_chat.approved" : "ai.mark_chat.manual_reply", actorId);
    return { success: true, delivered: true, message };
  });
}

export async function readPrivateChatOperator(organizationId: string, actorId: string, conversationId: string) {
  return prisma.$transaction(async tx => {
    const user = await authority(tx, organizationId, actorId, "conversations:view");
    const pilot = await locked(tx, organizationId, conversationId, false);
    const inbound = await latest(tx, conversationId);
    let turn = inbound?.role === "USER" ? await tx.markChatTurn.findUnique({ where: { conversationId_basedOnMessageId: { conversationId, basedOnMessageId: inbound.id } }, include: { draft: true } }) : null;
    if (turn?.draft.status === "READY") {
      let valid = pilot.active && pilot.expiresAt > new Date() && pilot.revision === turn.expectedRevision && pilot.conversation.aiHandled && !pilot.conversation.assignedToId && pilot.conversation.status === "OPEN" && turn.knowledgeVersion !== null;
      if (valid) { try { await lockPilotBudget(tx, organizationId); await assertPrivateReviewSources(tx, organizationId, turn.knowledgeVersion!); } catch { valid = false; } }
      if (!valid) { await dismiss(tx, organizationId, conversationId, "pilot_draft_no_longer_authorized"); turn = { ...turn, draft: { ...turn.draft, content: "", status: "DISMISSED" } }; }
    }
    const messages = await tx.message.findMany({ where: { conversationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, role: true, content: true } });
    const usage = turn?.usageId ? await tx.aiUsage.findFirst({ where: { id: turn.usageId, organizationId }, select: { costMxn: true } }) : null;
    const sources = turn?.sources ? z.array(z.object({ articleId: id, title: z.string(), version: z.number().int().positive() })).max(4).parse(turn.sources) : [];
    return { status: pilot.conversation.status, aiHandled: pilot.conversation.aiHandled, active: pilot.active && pilot.expiresAt > new Date(), canGenerate: can(user.role, "knowledge_base:manage"), canReply: can(user.role, "conversations:reply"), messages: messages.reverse(), inboundId: inbound?.role === "USER" ? inbound.id : null, turn: turn ? { draftId: turn.draftId, status: turn.draft.status, content: turn.draft.status === "READY" ? turn.draft.content : "", costMxn: usage?.costMxn?.toString() ?? null, sources, createdAt: turn.createdAt.toISOString() } : null };
  });
}

/** Safe recovery only; no model replay and no release of financial uncertainty. */
export async function recoverPrivateChat(organizationId: string, actorId: string, conversationId: string) {
  return prisma.$transaction(async tx => {
    await authority(tx, organizationId, actorId, "knowledge_base:manage");
    const pilot = await locked(tx, organizationId, conversationId, false);
    const stale = await tx.replyDraft.updateMany({ where: { organizationId, conversationId, status: "GENERATING", createdAt: { lt: new Date(Date.now() - 300000) } }, data: { status: "FAILED", error: "pilot_generation_interrupted", content: "" } });
    if (stale.count) {
      await tx.markChatPilot.update({ where: { id: pilot.id }, data: { revision: { increment: 1 } } });
      await tx.conversation.update({ where: { id: conversationId }, data: { aiHandled: false, ...(["CLOSED", "RESOLVED"].includes(pilot.conversation.status) ? {} : { status: "ESCALATED" as const, escalatedAt: new Date() }) } });
      await audit(tx, organizationId, conversationId, "ai.mark_chat.recover", actorId);
    }
    return { recovered: stale.count };
  });
}
