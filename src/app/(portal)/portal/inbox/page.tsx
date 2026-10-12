import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasInboxAccess } from "@/lib/inbox";
import { INBOX_TABS, channelsOfTab, parseInboxTab, tabOfChannel, type InboxTabKey } from "@/lib/channels";
import { InboxClient, type InboxFolder, type InboxItem } from "@/components/portal/InboxClient";
import type { Prisma } from "@prisma/client";

const LIST_SIZE = 100;
const FOLDERS: InboxFolder[] = ["inbox", "archived", "all"];

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; folder?: string; q?: string; c?: string }> }) {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  const orgId = session.user.organizationId;
  if (!(await hasInboxAccess(orgId))) return redirect("/portal/dashboard");

  const sp = await searchParams;
  const tab = parseInboxTab(sp.tab);
  const folder = FOLDERS.includes(sp.folder as InboxFolder) ? (sp.folder as InboxFolder) : "inbox";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const channels = channelsOfTab(tab);

  const where: Prisma.ConversationWhereInput = {
    organizationId: orgId,
    ...(folder === "inbox" ? { archivedAt: null } : folder === "archived" ? { archivedAt: { not: null } } : {}),
    ...(channels ? { channel: { in: [...channels] } } : {}),
    ...(q
      ? {
          OR: [
            { contactName: { contains: q, mode: "insensitive" } },
            { contactEmail: { contains: q, mode: "insensitive" } },
            { contactPhone: { contains: q } },
            { contactHandle: { contains: q, mode: "insensitive" } },
            { subject: { contains: q, mode: "insensitive" } },
            { lastMessagePreview: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, pendingByChannel] = await Promise.all([
    prisma.conversation.findMany({ where, orderBy: { lastMessageAt: "desc" }, take: LIST_SIZE }),
    // Pendientes de respuesta por canal (para el punto rojo de cada pestaña): lo último lo dijo el cliente.
    prisma.conversation.groupBy({
      by: ["channel"],
      where: { organizationId: orgId, archivedAt: null, lastMessageRole: "USER", status: { in: ["OPEN", "ESCALATED"] } },
      _count: { _all: true },
    }),
  ]);

  const pending: Record<InboxTabKey, number> = Object.fromEntries(INBOX_TABS.map((t) => [t.key, 0])) as Record<InboxTabKey, number>;
  for (const g of pendingByChannel) {
    pending.all += g._count._all;
    const key = tabOfChannel(g.channel);
    if (key !== "all") pending[key] += g._count._all;
  }

  const items: InboxItem[] = rows.map((c) => ({
    id: c.id,
    channel: c.channel,
    name: c.contactName ?? c.contactEmail ?? c.contactHandle ?? c.contactPhone ?? "—",
    subject: c.subject,
    preview: c.lastMessagePreview,
    lastMessageAt: c.lastMessageAt.toISOString(),
    lastMessageRole: c.lastMessageRole,
    unread: c.unreadCount,
    important: c.important,
    archived: c.archivedAt !== null,
    status: c.status,
  }));

  return <InboxClient items={items} tab={tab} folder={folder} query={q} pending={pending} initialId={sp.c ?? null} />;
}
