"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, ClipboardList, Globe, Inbox, Instagram, Loader2, Mail, MessageCircle, MessagesSquare, Search, Star, X, RefreshCw, MailOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CrmTabs } from "@/components/portal/CrmTabs";
import { ConversationActions } from "@/components/portal/ConversationActions";
import { MessageThread } from "@/components/portal/MessageThread";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { usePreferences } from "@/context/preferences";
import { markConversationUnread, openInboxThread, setConversationArchived, setConversationImportant, type InboxThread } from "@/actions/inbox";
import { INBOX_TABS, type InboxTabKey } from "@/lib/channels";
import { getErrorMessage } from "@/lib/user-error";
import { cn } from "@/lib/utils";

export type InboxFolder = "inbox" | "archived" | "all";
export type InboxItem = {
  id: string;
  channel: string;
  name: string;
  subject: string | null;
  preview: string | null;
  lastMessageAt: string;
  lastMessageRole: "USER" | "ASSISTANT" | "SYSTEM" | "AGENT" | null;
  unread: number;
  important: boolean;
  archived: boolean;
  status: "OPEN" | "ESCALATED" | "RESOLVED" | "CLOSED";
};

const COPY = {
  es: {
    title: "Inbox",
    subtitle: "Todos tus mensajes en un solo lugar",
    tabs: { all: "Todos", whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", webchat: "Chat del sitio", email: "Correo y consultas" } as Record<InboxTabKey, string>,
    folders: { inbox: "Entrada", archived: "Archivadas", all: "Todo" } as Record<InboxFolder, string>,
    search: "Buscar por nombre, correo, teléfono o mensaje…",
    legend: "Punto rojo = el cliente espera respuesta",
    needsReply: "Pendiente",
    answered: "Respondida",
    empty: "No hay conversaciones aquí",
    emptyHint: "Los mensajes de WhatsApp, Instagram, Messenger, el chat del sitio y el correo aparecen cuando conectas cada canal.",
    pick: "Elige una conversación para verla",
    back: "Volver a la lista",
    important: "Importante",
    unimportant: "Quitar de importantes",
    archive: "Archivar",
    unarchive: "Mover a la entrada",
    markUnread: "Marcar como no leída",
    contact: "Ver contacto",
    loadError: "No se pudo abrir la conversación",
    retry: "Reintentar",
    actionError: "No se pudo completar",
    archived: "Conversación archivada",
    restored: "Conversación en la entrada",
    markedUnread: "Marcada como no leída",
    channelName: { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", webchat: "Chat del sitio", email: "Correo", enquiry: "Consulta" } as Record<string, string>,
    unreadN: (n: number) => `${n} sin leer`,
    pendingN: (n: number) => `${n} esperando respuesta`,
  },
  en: {
    title: "Inbox",
    subtitle: "All your messages in one place",
    tabs: { all: "All", whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", webchat: "Website chat", email: "Email & enquiries" } as Record<InboxTabKey, string>,
    folders: { inbox: "Inbox", archived: "Archived", all: "All mail" } as Record<InboxFolder, string>,
    search: "Search by name, email, phone or message…",
    legend: "Red dot = the customer is waiting for a reply",
    needsReply: "Needs reply",
    answered: "Replied",
    empty: "No conversations here",
    emptyHint: "Messages from WhatsApp, Instagram, Messenger, website chat and email show up once you connect each channel.",
    pick: "Pick a conversation to view it",
    back: "Back to the list",
    important: "Important",
    unimportant: "Remove from important",
    archive: "Archive",
    unarchive: "Move to inbox",
    markUnread: "Mark as unread",
    contact: "View contact",
    loadError: "Couldn't open the conversation",
    retry: "Retry",
    actionError: "Couldn't complete",
    archived: "Conversation archived",
    restored: "Conversation moved to the inbox",
    markedUnread: "Marked as unread",
    channelName: { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", webchat: "Website chat", email: "Email", enquiry: "Enquiry" } as Record<string, string>,
    unreadN: (n: number) => `${n} unread`,
    pendingN: (n: number) => `${n} waiting for a reply`,
  },
};

const CHANNEL_ICON: Record<string, React.ElementType> = { whatsapp: MessageCircle, instagram: Instagram, messenger: MessagesSquare, webchat: Globe, email: Mail, enquiry: ClipboardList };

function initials(name: string) {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

function shortTime(iso: string, lang: "es" | "en") {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", sameDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" }).format(d);
}

export function InboxClient({ items, tab, folder, query, pending, initialId }: { items: InboxItem[]; tab: InboxTabKey; folder: InboxFolder; query: string; pending: Record<InboxTabKey, number>; initialId: string | null }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startNav] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [search, setSearch] = useState(query);

  function go(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    startNav(() => router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`, { scroll: false }));
  }

  // Búsqueda con espera para no consultar en cada tecla.
  useEffect(() => {
    if (search === query) return;
    const timer = setTimeout(() => go({ q: search || undefined }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function select(id: string | null) {
    setSelectedId(id);
    go({ c: id ?? undefined });
  }

  return (
    <div>
      <CrmTabs />
      <div className="mb-4 flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Inbox className="h-5 w-5 text-brand-600" /> {t.title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
          {t.subtitle}
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" /> {t.legend}
          </span>
        </p>
      </div>

      {/* Pestañas por canal, con punto rojo cuando hay clientes esperando respuesta. */}
      <div role="tablist" aria-label={t.title} className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {INBOX_TABS.map(({ key }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => go({ tab: key === "all" ? undefined : key, c: undefined })}
            className={cn(
              "inline-flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium motion-micro transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
              tab === key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {t.tabs[key]}
            {pending[key] > 0 && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
                <span className="sr-only">{t.pendingN(pending[key])}</span>
              </span>
            )}
          </button>
        ))}
      </div>

      <div className={cn("grid min-h-[32rem] grid-cols-1 gap-4 md:grid-cols-[22rem_minmax(0,1fr)] lg:grid-cols-[24rem_minmax(0,1fr)]", isNavigating && "opacity-80")} style={{ height: "calc(100dvh - 17rem)", minHeight: "32rem" }}>
        {/* Lista */}
        <div className={cn("flex min-h-0 min-w-0 flex-col rounded-card border border-slate-200 bg-white shadow-card md:flex", selectedId ? "hidden" : "flex")}>
          <div className="space-y-2 border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.search}
                aria-label={t.search}
                className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 motion-micro transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
              />
              {search && (
                <button onClick={() => setSearch("")} aria-label="×" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {(["inbox", "archived", "all"] as InboxFolder[]).map((f) => (
                  <button
                    key={f}
                    aria-pressed={folder === f}
                    onClick={() => go({ folder: f === "inbox" ? undefined : f, c: undefined })}
                    className={cn("rounded-md px-2.5 py-1 text-xs font-medium motion-micro transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500", folder === f ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
                  >
                    {t.folders[f]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <Inbox className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-700">{t.empty}</p>
                <p className="mt-1 text-xs text-slate-500">{t.emptyHint}</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => {
                  const Icon = CHANNEL_ICON[item.channel] ?? MessageCircle;
                  const waiting = item.lastMessageRole === "USER" && !item.archived && (item.status === "OPEN" || item.status === "ESCALATED");
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => select(item.id)}
                        aria-current={selectedId === item.id ? "true" : undefined}
                        className={cn("flex w-full items-start gap-3 px-3 py-3 text-left motion-micro transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none", selectedId === item.id && "bg-brand-50/60")}
                      >
                        <span className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                          {initials(item.name)}
                          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-white text-slate-500">
                            <Icon className="h-2.5 w-2.5" />
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className={cn("truncate text-sm", item.unread > 0 ? "font-semibold text-slate-900" : "font-medium text-slate-800")}>{item.name}</span>
                            {item.important && <Star className="h-3 w-3 flex-shrink-0 fill-amber-400 text-amber-400" aria-label={t.important} />}
                            <span className="ml-auto flex-shrink-0 text-[11px] text-slate-400">{shortTime(item.lastMessageAt, lang === "en" ? "en" : "es")}</span>
                          </span>
                          {item.subject && <span className="block truncate text-xs text-slate-600">{item.subject}</span>}
                          <span className="flex items-center gap-1.5">
                            <span className={cn("truncate text-xs", item.unread > 0 ? "text-slate-700" : "text-slate-500")}>{item.preview ?? ""}</span>
                          </span>
                          <span className="mt-1 flex items-center gap-1.5">
                            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">{t.channelName[item.channel] ?? item.channel}</span>
                            {waiting ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" /> {t.needsReply}
                              </span>
                            ) : item.lastMessageRole && item.lastMessageRole !== "USER" ? (
                              <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{t.answered}</span>
                            ) : null}
                            {item.unread > 0 && <span className="sr-only">{t.unreadN(item.unread)}</span>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Hilo */}
        <div className={cn("min-h-0 min-w-0 overflow-hidden rounded-card border border-slate-200 bg-white shadow-card md:block", selectedId ? "block" : "hidden")}>
          {selectedId ? (
            <ThreadPane key={selectedId} conversationId={selectedId} onBack={() => select(null)} onChanged={() => router.refresh()} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
              <MessagesSquare className="h-8 w-8" />
              <p className="text-sm">{t.pick}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadPane({ conversationId, onBack, onChanged }: { conversationId: string; onBack: () => void; onChanged: () => void }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const [data, setData] = useState<InboxThread | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    openInboxThread(conversationId)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Abrirlo lo marca como leído: la lista se actualiza para quitar el "sin leer".
        onChanged();
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, attempt]);

  if (failed && !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-medium text-slate-700">{t.loadError}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" /> {t.retry}
        </Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-4 p-5" aria-busy="true">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-card" />
        ))}
      </div>
    );
  }
  return <ThreadContent data={data} onBack={onBack} onChanged={onChanged} />;
}

function ThreadContent({ data, onBack, onChanged }: { data: InboxThread; onBack: () => void; onChanged: () => void }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const c = data.conversation;
  const Icon = CHANNEL_ICON[c.channel] ?? MessageCircle;
  const [important, setImportant] = useState(c.important);
  const [archived, setArchived] = useState(c.archived);
  const [busy, startBusy] = useTransition();
  const name = c.contactName ?? c.contactEmail ?? c.contactHandle ?? c.contactPhone ?? "—";
  const detail = useMemo(() => [c.contactPhone, c.contactEmail, c.contactHandle].filter(Boolean).join(" · "), [c]);

  function run(fn: () => Promise<unknown>, ok?: string) {
    startBusy(async () => {
      try {
        await fn();
        if (ok) toast.success(ok);
        onChanged();
      } catch (e) {
        toast.error(t.actionError, { description: getErrorMessage(e, "") || undefined });
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <button onClick={onBack} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 md:hidden" aria-label={t.back}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">{initials(name)}</div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-slate-900">{name}</h2>
          <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
            <Icon className="h-3 w-3" /> {t.channelName[c.channel] ?? c.channel}
            {detail && <span className="truncate">· {detail}</span>}
          </p>
          {c.subject && <p className="truncate text-xs font-medium text-slate-700">{c.subject}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="hidden sm:inline-flex">
            <StatusBadge status={c.status} />
          </span>
          {c.leadId && (
            <Link href={`/portal/leads/${c.leadId}`} className="rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
              {t.contact}
            </Link>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={busy}
            aria-pressed={important}
            aria-label={important ? t.unimportant : t.important}
            title={important ? t.unimportant : t.important}
            onClick={() => {
              const next = !important;
              setImportant(next);
              run(() => setConversationImportant(c.id, next).catch((e) => (setImportant(!next), Promise.reject(e))));
            }}
          >
            <Star className={cn("h-4 w-4", important && "fill-amber-400 text-amber-400")} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            disabled={busy}
            aria-label={archived ? t.unarchive : t.archive}
            title={archived ? t.unarchive : t.archive}
            onClick={() => {
              const next = !archived;
              run(async () => {
                await setConversationArchived(c.id, next);
                setArchived(next);
                toast.success(next ? t.archived : t.restored);
              });
            }}
          >
            {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busy} aria-label={t.markUnread} title={t.markUnread} onClick={() => run(() => markConversationUnread(c.id), t.markedUnread)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailOpen className="h-4 w-4" />}
          </Button>
        </div>
      </header>
      <div className="border-b border-slate-100 px-4 py-2">
        <ConversationActions conversationId={c.id} status={c.status} aiHandled={c.aiHandled} assignedTo={c.assignedTo} teamUsers={data.teamUsers} canReply={data.canReply} canAssign={data.canAssign} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <MessageThread conversationId={c.id} contactName={c.contactName} initialMessages={data.messages} hasMoreInitially={data.hasMore} canReply={data.canReply} aiDrafts={data.aiDrafts} />
      </div>
    </div>
  );
}
