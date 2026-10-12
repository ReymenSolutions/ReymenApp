"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { usePreferences } from "@/context/preferences";
import { saveRulebook } from "@/actions/rulebook";
import { setDraftsEnabled } from "@/actions/ai-drafts";
import { RULEBOOK_MAX_CHARS, RULEBOOK_SECTIONS, rulebookProgress, type RulebookInput, type RulebookSection } from "@/lib/rulebook";
import { getErrorMessage } from "@/lib/user-error";

const COPY = {
  es: {
    title: "Rulebook del negocio",
    how: "Cómo funciona.",
    howText: "Cuando entra un mensaje de un cliente, la IA lee toda la conversación más este rulebook y redacta una respuesta que sigue estas reglas. Nada se envía solo: cada respuesta espera a que tú presiones Enviar. ¿Quieres cambiar una regla o un precio? Edítalo aquí y se aplica en el siguiente borrador.",
    progress: (n: number, t: number) => `${n} de ${t} secciones listas`,
    save: "Guardar cambios",
    saving: "Guardando…",
    saved: "Guardado",
    savedToast: "Rulebook guardado",
    error: "No se pudo guardar. Tus cambios siguen aquí.",
    example: "Usar ejemplo",
    readOnly: "Solo quien administra la base de conocimiento puede editar el rulebook.",
    drafts: "Sugerir una respuesta con IA al abrir cada conversación",
    draftsHint: "La IA redacta un borrador con este rulebook; tú lo editas y lo envías.",
    draftsOff: "Los borradores de IA se activan cuando el servidor tiene la clave de Claude (ANTHROPIC_API_KEY).",
    draftsError: "No se pudo cambiar la opción",
    chars: (n: number, max: number) => `${n}/${max}`,
    sections: {
      voice: { title: "Cómo hablas", hint: "Tono y estilo: cercano, formal, directo… y cómo cierras cada respuesta.", example: "Dueño de taller, directo y amable.\nSin rodeos ni lenguaje corporativo.\nResponde la pregunta y luego propone el siguiente paso: un precio o una llamada." },
      greeting: { title: "Saludo", hint: "Cómo abres la conversación cuando sabes y cuando no sabes el nombre.", example: "\"Hola <nombre>,\" cuando sabemos su nombre; si no, \"Hola,\".\nNunca abrir con \"Hola amigo,\"." },
      rules: { title: "Reglas duras", hint: "Lo que la IA nunca debe hacer y lo que siempre debe hacer.", example: "Nunca inventes precios, fechas ni promesas.\nNunca presumas trabajos o cifras que no podamos respaldar.\nNunca envíes un enlace de pago o de reservación.\nToda respuesta espera a que el dueño presione Enviar." },
      pricing: { title: "Precios", hint: "Lista de precios o rangos que la IA puede citar (indica si incluyen IVA).", example: "Revisión inicial: desde $500 (IVA incluido)\nInstalación estándar: desde $2,000\nInstalación a medida: se cotiza por vehículo" },
    } as Record<RulebookSection, { title: string; hint: string; example: string }>,
  },
  en: {
    title: "Business rulebook",
    how: "How it works.",
    howText: "When a customer message comes in, the AI reads the whole conversation plus this rulebook and drafts a reply that follows these rules. Nothing sends on its own: every reply waits for you to press Send. Want to change a rule or a price? Edit it here and it applies to the next draft.",
    progress: (n: number, t: number) => `${n} of ${t} sections ready`,
    save: "Save changes",
    saving: "Saving…",
    saved: "Saved",
    savedToast: "Rulebook saved",
    error: "Couldn't save. Your changes are still here.",
    example: "Use example",
    readOnly: "Only people who manage the knowledge base can edit the rulebook.",
    drafts: "Suggest an AI reply when each conversation is opened",
    draftsHint: "The AI drafts a reply using this rulebook; you edit it and send it.",
    draftsOff: "AI drafts turn on once the server has the Claude key (ANTHROPIC_API_KEY).",
    draftsError: "Couldn't change the option",
    chars: (n: number, max: number) => `${n}/${max}`,
    sections: {
      voice: { title: "How you talk", hint: "Tone and style: friendly, formal, direct… and how you close each reply.", example: "Straight-talking workshop owner. Warm, friendly and helpful.\nNo fluff, no hype, no corporate speak.\nAnswer the actual question, then move toward the next step: a price or a call." },
      greeting: { title: "Greeting", hint: "How you open the conversation when you know the name and when you don't.", example: "\"Hi <first name>,\" when we know their name, otherwise \"Hi there,\".\nNever open with \"Hey mate,\"." },
      rules: { title: "Hard rules", hint: "What the AI must never do and what it must always do.", example: "Never invent prices, dates or promises.\nNever claim past jobs or numbers we can't back up.\nNever send a deposit, payment or booking link.\nEvery draft waits for the owner to press Send." },
      pricing: { title: "Prices", hint: "Price list or ranges the AI may quote (say whether tax is included).", example: "Initial check: from $500 (tax incl.)\nStandard install: from $2,000\nCustom install: quoted per vehicle" },
    } as Record<RulebookSection, { title: string; hint: string; example: string }>,
  },
};

export function RulebookEditor({ initial, canEdit, draftsEnabled = true, aiConfigured = true }: { initial: RulebookInput; canEdit: boolean; draftsEnabled?: boolean; aiConfigured?: boolean }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState(draftsEnabled);
  const [draftsBusy, startDrafts] = useTransition();
  const dirty = RULEBOOK_SECTIONS.some((k) => draft[k] !== saved[k]);
  const progress = rulebookProgress(draft);

  // Aviso del navegador si se intenta salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function save() {
    if (!dirty || pending) return;
    startTransition(async () => {
      try {
        await saveRulebook(draft);
        setSaved(draft);
        toast.success(t.savedToast);
      } catch (e) {
        // El texto se queda en pantalla para poder reintentar.
        toast.error(t.error, { description: getErrorMessage(e, "") || undefined });
      }
    });
  }

  return (
    <section aria-label={t.title} className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Sparkles className="h-4 w-4 text-brand-600" />
          {t.title}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{t.progress(progress.filled, progress.total)}</span>
        </h2>
        {canEdit && (
          <Button size="sm" onClick={save} disabled={!dirty} loading={pending}>
            {!pending && !dirty && <Check className="h-3.5 w-3.5" />}
            {pending ? t.saving : dirty ? t.save : t.saved}
          </Button>
        )}
      </div>

      <div className="mb-4 rounded-card border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">
        <strong>{t.how}</strong> {t.howText}
      </div>
      {!canEdit && <p className="mb-3 text-xs text-slate-500">{t.readOnly}</p>}

      <div className="mb-4 flex items-start justify-between gap-3 rounded-card border border-slate-200 bg-white p-3">
        <div>
          <p className="text-sm font-medium text-slate-900">{t.drafts}</p>
          <p className="text-xs text-slate-500">{aiConfigured ? t.draftsHint : t.draftsOff}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={drafts}
          aria-label={t.drafts}
          disabled={!canEdit || draftsBusy}
          onClick={() => {
            const next = !drafts;
            setDrafts(next);
            startDrafts(async () => {
              try {
                await setDraftsEnabled(next);
              } catch (e) {
                setDrafts(!next);
                toast.error(t.draftsError, { description: getErrorMessage(e, "") || undefined });
              }
            });
          }}
          className={`relative h-6 w-11 flex-shrink-0 rounded-full motion-micro transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50 ${drafts ? "bg-brand-600" : "bg-slate-300"}`}
        >
          <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[rgb(255_255_255)] shadow motion-micro transition-transform ${drafts ? "translate-x-5" : ""}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {RULEBOOK_SECTIONS.map((key) => {
          const copy = t.sections[key];
          const value = draft[key];
          return (
            <Card key={key}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <label htmlFor={`rulebook-${key}`} className="text-sm font-semibold text-slate-900">
                      {copy.title}
                    </label>
                    <p className="text-xs text-slate-500">{copy.hint}</p>
                  </div>
                  {canEdit && value.trim() === "" && (
                    <Button type="button" size="sm" variant="ghost" className="flex-shrink-0 text-xs" onClick={() => setDraft((d) => ({ ...d, [key]: copy.example }))}>
                      {t.example}
                    </Button>
                  )}
                </div>
                <Textarea
                  id={`rulebook-${key}`}
                  value={value}
                  readOnly={!canEdit}
                  maxLength={RULEBOOK_MAX_CHARS}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  className="min-h-[140px] resize-y font-mono text-[13px] leading-relaxed"
                />
                <p className="text-right text-[11px] tabular-nums text-slate-400">{t.chars(value.length, RULEBOOK_MAX_CHARS)}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
