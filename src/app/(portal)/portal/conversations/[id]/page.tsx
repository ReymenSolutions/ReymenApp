import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bot } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { draftsAvailable } from "@/lib/ai-draft";
import { getServerLang } from "@/lib/i18n-server";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { ConversationActions } from "@/components/portal/ConversationActions";
import { MessageThread } from "@/components/portal/MessageThread";
import { formatDateTime } from "@/lib/utils";
import type { UserRole } from "@prisma/client";

const MESSAGE_PAGE_SIZE = 50;

async function getConversation(id: string, orgId: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id, organizationId: orgId },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: MESSAGE_PAGE_SIZE,
        include: { sender: { select: { name: true, email: true } } },
      },
      assignedTo: { select: { id: true, name: true, email: true } },
      _count: { select: { messages: true } },
    },
  });
  if (!conv) return null;

  return {
    ...conv,
    messages: conv.messages.reverse(),
    hasMoreMessages: conv._count.messages > MESSAGE_PAGE_SIZE,
  };
}

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AI_WHATSAPP");
  const lang = await getServerLang();

  const [conv, teamUsers] = await Promise.all([
    getConversation(id, session.user.organizationId),
    prisma.user.findMany({
      where: { organizationId: session.user.organizationId, isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  if (!conv) notFound();

  const role = session.user.role as UserRole;
  const canReply = can(role, "conversations:reply");
  const canAssign = can(role, "conversations:assign");
  const aiDrafts = await draftsAvailable(session.user.organizationId, conv.channel);

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/portal/conversations"
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" /> {lang === "es" ? "Volver a conversaciones" : "Back to conversations"}
        </Link>
      </div>

      <PageHeader
        title={conv.contactName ?? conv.contactPhone ?? (lang === "es" ? "Conversación" : "Conversation")}
        description={`${conv.channel} · ${conv._count.messages} ${lang === "es" ? "mensajes" : "messages"}`}
        actions={
          <ConversationActions
            conversationId={conv.id}
            status={conv.status}
            aiHandled={conv.aiHandled}
            assignedTo={conv.assignedTo}
            teamUsers={teamUsers}
            canReply={canReply}
            canAssign={canAssign}
          />
        }
      />

      {/* Status & meta */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <StatusBadge status={conv.status} />
        <Badge variant="secondary" className="capitalize">{conv.channel}</Badge>
        {conv.aiHandled ? (
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Bot className="h-3 w-3" /> {lang === "es" ? "Manejado por IA" : "Handled by AI"}
          </span>
        ) : (
          <span className="text-xs text-slate-500">
            {lang === "es" ? "Control humano" : "Human control"}{conv.assignedTo ? ` · ${conv.assignedTo.name ?? conv.assignedTo.email}` : (lang === "es" ? " · sin asignar" : " · unassigned")}
          </span>
        )}
        {conv.escalatedAt && (
          <span className="text-xs text-amber-600">
            {lang === "es" ? "Escalado" : "Escalated"} {formatDateTime(conv.escalatedAt)}
          </span>
        )}
        {conv.resolvedAt && (
          <span className="text-xs text-emerald-600">
            {lang === "es" ? "Resuelto" : "Resolved"} {formatDateTime(conv.resolvedAt)}
          </span>
        )}
      </div>

      {/* Message thread */}
      <MessageThread
        conversationId={conv.id}
        contactName={conv.contactName}
        initialMessages={conv.messages}
        hasMoreInitially={conv.hasMoreMessages}
        canReply={canReply && conv.status !== "RESOLVED" && conv.status !== "CLOSED"}
        aiDrafts={aiDrafts}
      />
    </div>
  );
}
