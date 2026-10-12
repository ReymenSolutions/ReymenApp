"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Bot, Send, User, UserRoundCog, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { usePreferences } from "@/context/preferences";
import { testAgentReply } from "@/actions/agent";
import { getErrorMessage } from "@/lib/user-error";
import type { AgentPreview } from "@/lib/ai-auto-reply";

type Turn =
  | { kind: "customer"; text: string }
  | { kind: "agent"; text: string }
  | { kind: "handoff"; reason: string; draftedReply?: string };

const COPY = {
  es: {
    intro: "Escribe lo que te escribiría un cliente y mira qué respondería el Agente IA con tu Rulebook y tu base de conocimiento de hoy. Es una prueba: no se envía ni se guarda nada.",
    placeholder: "Mensaje del cliente… (Enter envía, Mayús+Enter salta de línea)",
    send: "Probar",
    reset: "Empezar de nuevo",
    thinking: "El agente está pensando…",
    customer: "Cliente",
    agent: "Agente IA",
    handoff: "Lo pasaría a una persona",
    drafted: "Había redactado (no pasó la revisión):",
    error: "No se pudo hacer la prueba",
    empty: "Prueba con una pregunta real: un precio, un horario, una queja…",
    editHint: "¿No responde como quieres? Ajusta el Rulebook o los artículos y vuelve a probar.",
  },
  en: {
    intro: "Type what a customer would write and see what the AI Agent would answer with today's Rulebook and knowledge base. This is a test: nothing is sent or saved.",
    placeholder: "Customer message… (Enter sends, Shift+Enter for a new line)",
    send: "Test",
    reset: "Start over",
    thinking: "The agent is thinking…",
    customer: "Customer",
    agent: "AI Agent",
    handoff: "Would hand over to a person",
    drafted: "It had drafted (failed the check):",
    error: "Couldn't run the test",
    empty: "Try a real question: a price, opening hours, a complaint…",
    editHint: "Not answering the way you want? Adjust the Rulebook or the articles and test again.",
  },
};

export function AgentTester({ aiConfigured, notConfiguredText }: { aiConfigured: boolean; notConfiguredText: string }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  function toHistory(list: Turn[]): { role: "USER" | "ASSISTANT"; content: string }[] {
    const out: { role: "USER" | "ASSISTANT"; content: string }[] = [];
    for (const x of list) {
      if (x.kind === "customer") out.push({ role: "USER", content: x.text });
      else if (x.kind === "agent") out.push({ role: "ASSISTANT", content: x.text });
    }
    return out;
  }

  function submit() {
    const text = input.trim();
    if (!text || pending || !aiConfigured) return;
    const next: Turn[] = [...turns, { kind: "customer", text }];
    setTurns(next);
    setInput("");
    start(async () => {
      try {
        const result: AgentPreview = await testAgentReply(toHistory(next));
        setTurns((cur) => [...cur, result.action === "reply" ? { kind: "agent", text: result.reply } : { kind: "handoff", reason: result.reason, draftedReply: result.draftedReply }]);
      } catch (e) {
        setTurns(turns); // se quita el mensaje que no obtuvo respuesta
        setInput(text);
        toast.error(t.error, { description: getErrorMessage(e, "") || undefined });
      } finally {
        setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
      }
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <p className="text-sm text-slate-600">{t.intro}</p>
        {!aiConfigured && <p className="rounded-card border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{notConfiguredText}</p>}

        <div className="max-h-[28rem] min-h-40 space-y-3 overflow-y-auto rounded-card border border-slate-200 p-3" aria-live="polite">
          {turns.length === 0 && <p className="py-8 text-center text-sm text-slate-400">{t.empty}</p>}
          {turns.map((turn, i) => (
            <div key={i} className="flex gap-2.5">
              <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${turn.kind === "customer" ? "bg-slate-200 text-slate-700" : turn.kind === "agent" ? "bg-brand-100 text-brand-700" : "bg-amber-100 text-amber-700"}`}>
                {turn.kind === "customer" ? <User className="h-3.5 w-3.5" /> : turn.kind === "agent" ? <Bot className="h-3.5 w-3.5" /> : <UserRoundCog className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-500">{turn.kind === "customer" ? t.customer : turn.kind === "agent" ? t.agent : t.handoff}</p>
                {turn.kind === "handoff" ? (
                  <div className="text-sm text-slate-900">
                    <p>{turn.reason}</p>
                    {turn.draftedReply && (
                      <p className="mt-1 text-xs text-slate-500">
                        {t.drafted} <span className="whitespace-pre-wrap">{turn.draftedReply}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap text-sm text-slate-900">{turn.text}</div>
                )}
              </div>
            </div>
          ))}
          {pending && <p className="text-xs text-slate-400">{t.thinking}</p>}
          <div ref={bottom} />
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t.placeholder}
            rows={2}
            maxLength={1000}
            disabled={!aiConfigured}
            className="min-h-0 flex-1"
          />
          <Button onClick={submit} disabled={!input.trim() || !aiConfigured} loading={pending}>
            {!pending && <Send className="h-4 w-4" />} {t.send}
          </Button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">{t.editHint}</p>
          {turns.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setTurns([])}>
              <RotateCcw className="h-3.5 w-3.5" /> {t.reset}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
