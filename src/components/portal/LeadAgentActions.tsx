"use client";

import { useState, useTransition } from "react";
import { Bot, Check, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/context/preferences";
import { acceptAiSuggestion, rejectAiSuggestion, undoAiAction } from "@/actions/ai-pipeline";
import { getErrorMessage } from "@/lib/user-error";
import { formatDateTime } from "@/lib/utils";

export type AgentActionItem = {
  id: string;
  status: "APPLIED" | "SUGGESTED";
  kind: "CREATE_OPPORTUNITY" | "ADVANCE_STAGE" | "CLOSE_WON" | "CLOSE_LOST";
  reason: string;
  opportunityTitle: string;
  fromStageName: string | null;
  toStageName: string | null;
  createdAt: Date;
};

const COPY = {
  es: {
    title: "Agente IA",
    summary: "Lo que entendió",
    applied: "Lo hizo solo",
    suggested: "Sugiere (tú decides)",
    kind: {
      CREATE_OPPORTUNITY: (a: AgentActionItem) => `Creó la oportunidad «${a.opportunityTitle}» en ${a.toStageName}`,
      ADVANCE_STAGE: (a: AgentActionItem) => `Movió «${a.opportunityTitle}» de ${a.fromStageName} a ${a.toStageName}`,
      CLOSE_WON: (a: AgentActionItem) => `Cerrar «${a.opportunityTitle}» como ganada (${a.toStageName})`,
      CLOSE_LOST: (a: AgentActionItem) => `Cerrar «${a.opportunityTitle}» como perdida (${a.toStageName})`,
    },
    why: "Por qué",
    undo: "Deshacer",
    accept: "Aplicar",
    reject: "Descartar",
    undone: "Deshecho",
    done: "Hecho",
    dismissed: "Descartada",
    error: "No se pudo completar",
  },
  en: {
    title: "AI Agent",
    summary: "What it understood",
    applied: "Did it on its own",
    suggested: "Suggests (you decide)",
    kind: {
      CREATE_OPPORTUNITY: (a: AgentActionItem) => `Created opportunity “${a.opportunityTitle}” at ${a.toStageName}`,
      ADVANCE_STAGE: (a: AgentActionItem) => `Moved “${a.opportunityTitle}” from ${a.fromStageName} to ${a.toStageName}`,
      CLOSE_WON: (a: AgentActionItem) => `Close “${a.opportunityTitle}” as won (${a.toStageName})`,
      CLOSE_LOST: (a: AgentActionItem) => `Close “${a.opportunityTitle}” as lost (${a.toStageName})`,
    },
    why: "Why",
    undo: "Undo",
    accept: "Apply",
    reject: "Dismiss",
    undone: "Undone",
    done: "Done",
    dismissed: "Dismissed",
    error: "Couldn't complete",
  },
};

/** Lo que el Agente IA hizo o sugiere en el pipeline de este contacto, con el motivo y deshacer. */
export function LeadAgentActions({ actions, canManage, onChanged }: { actions: AgentActionItem[]; canManage: boolean; onChanged: () => void }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const [pending, start] = useTransition();
  const [gone, setGone] = useState<Record<string, string>>({});
  if (actions.length === 0) return null;

  function run(id: string, fn: (id: string) => Promise<unknown>, label: string) {
    if (pending) return;
    start(async () => {
      try {
        await fn(id);
        setGone((g) => ({ ...g, [id]: label }));
        toast.success(label);
        onChanged();
      } catch (e) {
        toast.error(t.error, { description: getErrorMessage(e, "") || undefined });
      }
    });
  }

  return (
    <section aria-label={t.title} className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Bot className="h-3.5 w-3.5" /> {t.title}
      </h3>
      {actions.map((a) => (
        <div key={a.id} className="rounded-card border border-brand-200 bg-brand-50 p-3 text-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">{a.status === "APPLIED" ? t.applied : t.suggested}</p>
          <p className="mt-0.5 text-slate-900">{t.kind[a.kind](a)}</p>
          <p className="mt-1 text-xs text-slate-600">
            {t.why}: {a.reason}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(a.createdAt, lang)}</p>
          {gone[a.id] ? (
            <p className="mt-2 text-xs font-medium text-slate-500">{gone[a.id]}</p>
          ) : (
            canManage && (
              <div className="mt-2 flex gap-2">
                {a.status === "APPLIED" ? (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(a.id, undoAiAction, t.undone)}>
                    <Undo2 className="h-3.5 w-3.5" /> {t.undo}
                  </Button>
                ) : (
                  <>
                    <Button size="sm" disabled={pending} onClick={() => run(a.id, acceptAiSuggestion, t.done)}>
                      <Check className="h-3.5 w-3.5" /> {t.accept}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(a.id, rejectAiSuggestion, t.dismissed)}>
                      <X className="h-3.5 w-3.5" /> {t.reject}
                    </Button>
                  </>
                )}
              </div>
            )
          )}
        </div>
      ))}
    </section>
  );
}
