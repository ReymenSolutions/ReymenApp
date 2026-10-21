import { prisma } from "@/lib/prisma";
import { INBOX_CHANNELS } from "@/lib/channels";
import { agentModelEnabled } from "./model";

export function pageNumber(raw: unknown) {
  const n = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : 1;
  return Math.max(1, Number.isSafeInteger(n) ? n : 1);
}

/** Private server readers: callers derive tenant from auth, never from a form. */
export async function getCenterConversations(organizationId: string) {
  const [total, open, human, recent] = await Promise.all([
    prisma.conversation.count({ where: { organizationId } }),
    prisma.conversation.count({ where: { organizationId, status: "OPEN", archivedAt: null } }),
    prisma.conversation.count({ where: { organizationId, status: "ESCALATED", archivedAt: null } }),
    prisma.conversation.findMany({ where: { organizationId, archivedAt: null }, orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }], take: 5, select: { id: true, contactName: true, channel: true, status: true, lastMessageAt: true } }),
  ]);
  return { total, open, human, recent };
}

/** Received activity is not a certificate of current connection health. */
export async function getCenterChannelActivity(organizationId: string) {
  return Promise.all(INBOX_CHANNELS.map(async channel => ({ channel, receivedAt: (await prisma.message.findFirst({ where: { role: "USER", conversation: { organizationId, channel } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { createdAt: true } }))?.createdAt ?? null })));
}

export async function getCenterExecutions(organizationId: string, rawPage: unknown) {
  if (!agentModelEnabled()) return { available: false, rows: [], total: 0, page: 1, pages: 1 };
  const total = await prisma.agentExecution.count({ where: { organizationId } });
  const pages = Math.max(1, Math.ceil(total / 10)), page = Math.min(pageNumber(rawPage), pages);
  const rows = await prisma.agentExecution.findMany({ where: { organizationId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10, skip: (page - 1) * 10, select: { id: true, status: true, operation: true, createdAt: true, configVersion: true } });
  return { available: true, rows, total, page, pages };
}

export async function getCenterArticles(organizationId: string, input: { q?: unknown; category?: unknown; page?: unknown }) {
  const q = typeof input.q === "string" ? input.q.trim().slice(0, 120) : "";
  const category = typeof input.category === "string" ? input.category : "";
  const where = { organizationId, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { content: { contains: q, mode: "insensitive" as const } }] } : {}), ...(category ? { category } : {}) };
  const [total, active, categories] = await Promise.all([
    prisma.knowledgeBase.count({ where }),
    prisma.knowledgeBase.count({ where: { organizationId, isActive: true } }),
    prisma.knowledgeBase.findMany({ where: { organizationId, category: { not: null } }, distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / 10)), page = Math.min(pageNumber(input.page), pages);
  const rows = await prisma.knowledgeBase.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 10, skip: (page - 1) * 10 });
  return { rows, total, active, categories: categories.map(c => c.category!), page, pages, q, category };
}
