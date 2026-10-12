"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Power, Lightbulb, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePreferences } from "@/context/preferences";
import { setAgentChannelMode } from "@/actions/agent";
import { getErrorMessage } from "@/lib/user-error";
import { SELECTABLE_AGENT_MODES } from "@/lib/agent-mode";
import type { AgentMode } from "@prisma/client";

const COPY = {
  es: {
    title: "Qué hace el Agente IA en cada canal",
    desc: "Elige por canal. Todos usan el mismo Rulebook y la misma base de conocimiento.",
    channels: { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", webchat: "Chat del sitio web", email: "Correo", enquiry: "Consultas (formularios)" } as Record<string, string>,
    modes: {
      OFF: { label: "Apagado", hint: "No hace nada: ni borradores ni respuestas." },
      SUGGEST: { label: "Sugerir", hint: "Redacta un borrador; tú lo editas y lo envías." },
      AUTO: { label: "Automático", hint: "Responde solo dentro de tus reglas. Próximamente." },
    } as Record<AgentMode, { label: string; hint: string }>,
    soon: "Próximamente",
    noKey: "Falta la clave de Claude en el servidor (ANTHROPIC_API_KEY): mientras tanto no se generan borradores.",
    readOnly: "Solo quien gestiona la base de conocimiento puede cambiar esto.",
    saved: "Guardado",
    error: "No se pudo cambiar el modo",
  },
  en: {
    title: "What the AI Agent does on each channel",
    desc: "Choose per channel. They all use the same Rulebook and knowledge base.",
    channels: { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", webchat: "Website chat", email: "Email", enquiry: "Enquiries (forms)" } as Record<string, string>,
    modes: {
      OFF: { label: "Off", hint: "Does nothing: no drafts and no replies." },
      SUGGEST: { label: "Suggest", hint: "Writes a draft; you edit it and send it." },
      AUTO: { label: "Automatic", hint: "Replies on its own within your rules. Coming soon." },
    } as Record<AgentMode, { label: string; hint: string }>,
    soon: "Coming soon",
    noKey: "The server has no Claude key (ANTHROPIC_API_KEY): no drafts are generated meanwhile.",
    readOnly: "Only people who manage the knowledge base can change this.",
    saved: "Saved",
    error: "Couldn't change the mode",
  },
};

const ICON = { OFF: Power, SUGGEST: Lightbulb, AUTO: Zap } as const;
const ORDER: AgentMode[] = ["OFF", "SUGGEST", "AUTO"];

export function AgentModesPanel({ initial, canEdit, aiConfigured }: { initial: Record<string, AgentMode>; canEdit: boolean; aiConfigured: boolean }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const [modes, setModes] = useState(initial);
  const [pending, start] = useTransition();

  function choose(channel: string, mode: AgentMode) {
    if (!canEdit || pending || modes[channel] === mode) return;
    const previous = modes[channel];
    setModes((m) => ({ ...m, [channel]: mode }));
    start(async () => {
      try {
        await setAgentChannelMode(channel, mode);
        toast.success(t.saved);
      } catch (e) {
        setModes((m) => ({ ...m, [channel]: previous }));
        toast.error(t.error, { description: getErrorMessage(e, "") || undefined });
      }
    });
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">{t.title}</CardTitle>
        <p className="text-sm text-slate-500">{t.desc}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!aiConfigured && <p className="rounded-card border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{t.noKey}</p>}
        {!canEdit && <p className="text-xs text-slate-500">{t.readOnly}</p>}
        {Object.keys(initial).map((channel) => (
          <div key={channel} className="flex flex-col gap-2 rounded-card border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{t.channels[channel] ?? channel}</p>
              <p className="text-xs text-slate-500">{t.modes[modes[channel]].hint}</p>
            </div>
            <div role="radiogroup" aria-label={t.channels[channel] ?? channel} className="inline-flex flex-shrink-0 rounded-lg bg-slate-100 p-0.5">
              {ORDER.map((mode) => {
                const Icon = ICON[mode];
                const selectable = SELECTABLE_AGENT_MODES.includes(mode);
                const active = modes[channel] === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!canEdit || pending || !selectable}
                    title={selectable ? t.modes[mode].hint : t.soon}
                    onClick={() => choose(channel, mode)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium motion-micro transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${active ? "bg-[rgb(255_255_255)] text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.modes[mode].label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
