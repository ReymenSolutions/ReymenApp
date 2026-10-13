"use client";

import { useEffect, useState, useTransition } from "react";
import { Bot, User, Settings, Headset, Loader2, ChevronUp, Clock, Check, CheckCheck, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getOlderMessages } from "@/actions/conversations";
import { MessageComposer } from "@/components/portal/MessageComposer";
import { ReplyDraftPanel, type DraftUi } from "@/components/portal/ReplyDraftPanel";
import { regenerateReplyDraft, requestReplyDraft, dismissReplyDraft } from "@/actions/ai-drafts";
import { formatDateTime } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import type { Message, MessageDeliveryStatus } from "@prisma/client";
import { getErrorMessage } from "@/lib/user-error";

type MessageWithSender = Message & { sender: { name: string | null; email: string } | null };

interface MessageThreadProps {
  conversationId: string;
  contactName: string | null;
  initialMessages: MessageWithSender[];
  hasMoreInitially: boolean;
  canReply: boolean;
  /** La IA puede sugerir un borrador para el último mensaje del cliente. */
  aiDrafts?: boolean;
}

function DeliveryStatusIcon({ status }: { status: MessageDeliveryStatus | null }) {
  if (!status) return null;
  if (status === "PENDING") return <Clock className="h-3 w-3 text-slate-400" />;
  if (status === "SENT") return <Check className="h-3 w-3 text-slate-400" />;
  if (status === "DELIVERED") return <CheckCheck className="h-3 w-3 text-slate-400" />;
  if (status === "READ") return <CheckCheck className="h-3 w-3 text-brand-600" />;
  return <AlertCircle className="h-3 w-3 text-red-500" />;
}

function Attachment({ url, type, lang }: { url: string; type: string | null; lang: string }) {
  if (type?.startsWith("image/")) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={lang === "es" ? "Adjunto" : "Attachment"} className="mt-2 max-h-48 rounded-md border border-slate-200" />;
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-brand-600 hover:underline">
      {lang === "es" ? "Ver adjunto" : "View attachment"}
    </a>
  );
}

export function MessageThread({ conversationId, contactName, initialMessages, hasMoreInitially, canReply, aiDrafts = false }: MessageThreadProps) {
  const { lang } = usePreferences();
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(hasMoreInitially);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Borrador de la IA: solo si lo último lo dijo el cliente. Se pide al abrir; si otra petición lo está
  // redactando se vuelve a preguntar unos segundos después.
  const lastIsCustomer = messages[messages.length - 1]?.role === "USER";
  const wantsDraft = aiDrafts && canReply && lastIsCustomer;
  const [draft, setDraft] = useState<DraftUi>(wantsDraft ? { status: "loading" } : null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [prefill, setPrefill] = useState<{ key: string; text: string; force?: boolean } | null>(null);

  useEffect(() => {
    if (!wantsDraft) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = (attempt: number) => {
      requestReplyDraft(conversationId)
        .then((r) => {
          if (cancelled) return;
          if (r.state === "ready") {
            setDraft({ status: "ready", id: r.draft.id, content: r.draft.content });
            setPrefill({ key: r.draft.id, text: r.draft.content });
          } else if (r.state === "generating" && attempt < 6) {
            timer = setTimeout(() => ask(attempt + 1), 3000);
          } else if (r.state === "failed") setDraft({ status: "failed" });
          else if (r.state === "budget_exhausted") setDraft({ status: "budget" });
          else setDraft(null);
        })
        .catch(() => !cancelled && setDraft({ status: "failed" }));
    };
    ask(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [conversationId, wantsDraft]);

  async function regenerate() {
    setDraftBusy(true);
    try {
      const r = await regenerateReplyDraft(conversationId);
      if (r.state === "ready") {
        setDraft({ status: "ready", id: r.draft.id, content: r.draft.content });
        setPrefill({ key: r.draft.id, text: r.draft.content, force: true });
      } else setDraft(r.state === "failed" ? { status: "failed" } : r.state === "budget_exhausted" ? { status: "budget" } : null);
    } catch {
      setDraft({ status: "failed" });
    } finally {
      setDraftBusy(false);
    }
  }

  async function dismissDraft() {
    const id = draft?.status === "ready" ? draft.id : null;
    setDraft(null);
    if (id) await dismissReplyDraft(id).catch(() => {});
  }

  function loadOlder() {
    if (messages.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await getOlderMessages(conversationId, messages[0].id);
        setMessages((prev) => [...result.messages, ...prev]);
        setHasMore(result.hasMore);
      } catch (e) {
        setError(getErrorMessage(e, (lang === "es" ? "Error al cargar mensajes anteriores" : "Error loading older messages")));
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-0">
        {messages.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {lang === "es" ? "Sin mensajes en esta conversación" : "No messages in this conversation"}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {hasMore && (
              <div className="p-3 text-center border-b border-slate-50">
                <button
                  onClick={loadOlder}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronUp className="h-3.5 w-3.5" />}
                  {lang === "es" ? "Cargar mensajes anteriores" : "Load older messages"}
                </button>
                {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 p-4 ${
                  msg.role === "USER" ? "bg-white" : msg.role === "ASSISTANT" ? "bg-slate-50" : msg.role === "AGENT" ? "bg-brand-50/40" : "bg-amber-50"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    msg.role === "USER"
                      ? "bg-slate-200 text-slate-700"
                      : msg.role === "ASSISTANT"
                      ? "bg-brand-100 text-brand-700"
                      : msg.role === "AGENT"
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {msg.role === "USER" ? (
                    <User className="h-4 w-4" />
                  ) : msg.role === "ASSISTANT" ? (
                    <Bot className="h-4 w-4" />
                  ) : msg.role === "AGENT" ? (
                    <Headset className="h-4 w-4" />
                  ) : (
                    <Settings className="h-4 w-4" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-slate-700">
                      {msg.role === "USER"
                        ? contactName ?? (lang === "es" ? "Usuario" : "User")
                        : msg.role === "ASSISTANT"
                        ? (lang === "es" ? "Agente IA" : "AI Agent")
                        : msg.role === "AGENT"
                        ? msg.sender?.name ?? msg.sender?.email ?? (lang === "es" ? "Agente" : "Agent")
                        : (lang === "es" ? "Sistema" : "System")}
                    </span>
                    <span className="text-xs text-slate-400">
                      {formatDateTime(msg.createdAt, lang)}
                    </span>
                    {msg.role === "AGENT" && <DeliveryStatusIcon status={msg.deliveryStatus} />}
                  </div>
                  <p className="text-sm text-slate-900 whitespace-pre-wrap leading-relaxed">
                    {msg.content}
                  </p>
                  {msg.attachmentUrl && <Attachment url={msg.attachmentUrl} type={msg.attachmentType} lang={lang} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      {canReply && (
        <MessageComposer
          conversationId={conversationId}
          onSent={(msg) => {
            setMessages((prev) => [...prev, msg]);
            setDraft(null);
          }}
          prefill={prefill}
          draftId={draft?.status === "ready" ? draft.id : null}
          slot={
            <ReplyDraftPanel
              draft={draft}
              busy={draftBusy}
              onUse={(text) => setPrefill({ key: `use-${Date.now()}`, text, force: true })}
              onRegenerate={regenerate}
              onDismiss={dismissDraft}
            />
          }
        />
      )}
    </Card>
  );
}
