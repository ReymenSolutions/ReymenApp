"use client";

import { Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreferences } from "@/context/preferences";

export type DraftUi = { status: "loading" } | { status: "ready"; id: string; content: string } | { status: "failed" } | null;

const COPY = {
  es: {
    title: "Respuesta sugerida por IA",
    optional: "opcional",
    loading: "La IA está redactando una respuesta…",
    use: "Usar respuesta",
    another: "Otra versión",
    dismiss: "Descartar",
    failed: "No se pudo redactar una sugerencia.",
    retry: "Reintentar",
    hint: "Ya está en tu cuadro de respuesta: edítala y presiona Enviar (Ctrl/Cmd + Enter). Nada se envía solo.",
  },
  en: {
    title: "AI suggested response",
    optional: "optional",
    loading: "The AI is drafting a reply…",
    use: "Use response",
    another: "Another version",
    dismiss: "Dismiss",
    failed: "Couldn't draft a suggestion.",
    retry: "Retry",
    hint: "It's already in your reply box: edit it and press Send (Ctrl/Cmd + Enter). Nothing sends on its own.",
  },
};

/** Sugerencia de la IA sobre el cuadro de respuesta: "Usar respuesta" la vuelve a poner en el cuadro, editable. */
export function ReplyDraftPanel({ draft, busy, onUse, onRegenerate, onDismiss }: { draft: DraftUi; busy: boolean; onUse: (text: string) => void; onRegenerate: () => void; onDismiss: () => void }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  if (!draft) return null;

  return (
    <div className="mb-3 rounded-card border border-brand-200 bg-brand-50/60 p-3 animate-pop-in" aria-live="polite">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-brand-800">
        <Sparkles className="h-3.5 w-3.5" /> {t.title} <span className="font-normal text-slate-500">· {t.optional}</span>
      </div>
      {draft.status === "loading" && (
        <div className="space-y-2" aria-busy="true">
          <p className="flex items-center gap-2 text-xs text-slate-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t.loading}
          </p>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      )}
      {draft.status === "ready" && (
        <>
          <p className="max-h-28 overflow-y-auto whitespace-pre-wrap text-sm text-slate-800">{draft.content}</p>
          <p className="mt-1.5 text-[11px] text-slate-500">{t.hint}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => onUse(draft.content)} disabled={busy}>
              {t.use}
            </Button>
            <Button size="sm" variant="outline" onClick={onRegenerate} loading={busy}>
              {!busy && <RefreshCw className="h-3.5 w-3.5" />} {t.another}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
              <X className="h-3.5 w-3.5" /> {t.dismiss}
            </Button>
          </div>
        </>
      )}
      {draft.status === "failed" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-slate-600">{t.failed}</p>
          <Button size="sm" variant="outline" onClick={onRegenerate} loading={busy}>
            {!busy && <RefreshCw className="h-3.5 w-3.5" />} {t.retry}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}>
            {t.dismiss}
          </Button>
        </div>
      )}
    </div>
  );
}
