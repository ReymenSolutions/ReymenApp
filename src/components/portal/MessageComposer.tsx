"use client";

import { useRef, useState, useTransition } from "react";
import { Paperclip, Send, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import { sendManualMessage } from "@/actions/conversations";
import type { Message } from "@prisma/client";
import { getErrorMessage } from "@/lib/user-error";

type MessageWithSender = Message & { sender: { name: string | null; email: string } | null };

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export function MessageComposer({
  conversationId,
  onSent,
  prefill,
  draftId,
  slot,
}: {
  conversationId: string;
  onSent: (message: MessageWithSender) => void;
  /** Texto que se pone en el cuadro (el borrador de la IA). `force` lo reemplaza aunque haya algo escrito. */
  prefill?: { key: string; text: string; force?: boolean } | null;
  /** Borrador de IA del que parte la respuesta: al enviar se registra qué se mandó. */
  draftId?: string | null;
  /** Contenido extra sobre el cuadro de respuesta (el panel de la sugerencia de IA). */
  slot?: React.ReactNode;
}) {
  const { lang } = usePreferences();
  const [content, setContent] = useState("");
  const [appliedKey, setAppliedKey] = useState<string | null>(null);
  if (prefill && prefill.key !== appliedKey) {
    setAppliedKey(prefill.key);
    if (prefill.force || content.trim() === "") setContent(prefill.text);
  }
  // Con un borrador de IA (varias líneas) Enter agrega un renglón y se envía con Ctrl/Cmd + Enter: así un
  // toque accidental no manda el mensaje a medias.
  const multiline = !!draftId;
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [attachmentType, setAttachmentType] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error(lang === "es" ? "Adjunto demasiado grande (máx. 5MB)" : "Attachment too large (max 5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setAttachmentUrl(event.target!.result as string);
      setAttachmentType(file.type);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleSend() {
    if (!content.trim() && !attachmentUrl) return;
    startTransition(async () => {
      try {
        const result = await sendManualMessage({
          conversationId,
          content,
          attachmentUrl: attachmentUrl ?? undefined,
          attachmentType: attachmentType ?? undefined,
          draftId: draftId ?? undefined,
        });
        onSent(result.message as MessageWithSender);
        if (!result.delivered) {
          toast.error(lang === "es" ? "El mensaje se guardó pero no se pudo enviar por WhatsApp" : "Message saved but could not be sent via WhatsApp");
        }
        setContent("");
        setAttachmentUrl(null);
        setAttachmentType(null);
      } catch (e) {
        toast.error(getErrorMessage(e, (lang === "es" ? "Error al enviar el mensaje" : "Error sending message")));
      }
    });
  }

  return (
    <div className="border-t border-slate-100 p-3">
      {slot}
      {attachmentUrl && (
        <div className="mb-2 flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
          {attachmentType?.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={attachmentUrl} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            <Paperclip className="h-3.5 w-3.5" />
          )}
          <span className="flex-1 truncate">{lang === "es" ? "Adjunto listo" : "Attachment ready"}</span>
          <button type="button" onClick={() => { setAttachmentUrl(null); setAttachmentType(null); }} className="text-slate-400 hover:text-red-500">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFile} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          title={lang === "es" ? "Adjuntar archivo" : "Attach file"}
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            if (multiline && !(e.metaKey || e.ctrlKey)) return;
            e.preventDefault();
            handleSend();
          }}
          placeholder={lang === "es" ? "Escribe una respuesta..." : "Write a reply..."}
          aria-label={lang === "es" ? "Tu respuesta" : "Your reply"}
          className={multiline ? "min-h-[120px] flex-1 resize-y text-sm" : "min-h-[40px] flex-1 resize-none text-sm"}
          rows={multiline ? 5 : 1}
        />
        <Button size="sm" onClick={handleSend} disabled={isPending || (!content.trim() && !attachmentUrl)}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
