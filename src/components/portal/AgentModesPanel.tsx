"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Power, Lightbulb, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { usePreferences } from "@/context/preferences";
import { setAgentChannelMode } from "@/actions/agent";
import { getErrorMessage } from "@/lib/user-error";
import type { AgentMode } from "@prisma/client";

const COPY = {
  es: {
    title: "Qué hace el Agente IA en cada canal",
    desc: "Elige por canal. Todos usan el mismo Rulebook y la misma base de conocimiento.",
    channels: { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger", webchat: "Chat del sitio web", email: "Correo", enquiry: "Consultas (formularios)" } as Record<string, string>,
    modes: {
      OFF: { label: "Apagado", hint: "No hace nada: ni borradores ni respuestas." },
      SUGGEST: { label: "Sugerir", hint: "Redacta un borrador; tú lo editas y lo envías." },
      AUTO: { label: "Automático", hint: "Responde solo lo que tu Rulebook cubre; lo demás lo pasa a una persona." },
    } as Record<AgentMode, { label: string; hint: string }>,
    confirmTitle: "¿Que el agente responda solo en este canal?",
    confirmBody: "Enviará respuestas a tus clientes sin que nadie las revise. Solo contesta lo que tu Rulebook cubre; si el cliente se queja, pide a una persona o el agente duda, pasa la conversación a tu equipo. Nunca manda enlaces ni pide pagos. Puedes apagarlo cuando quieras.",
    confirm: "Sí, activar",
    cancel: "Cancelar",
    noKey: "Falta la clave de Claude en el servidor (ANTHROPIC_API_KEY): mientras tanto no se generan borradores.",
    readOnly: "Solo quien gestiona la base de conocimiento puede cambiar esto.",
    capLine: (active: number, cap: number) => `Agentes activos: ${active} de ${cap} incluidos en tu plan`,
    capReached: "Llegaste al tope de agentes de tu plan: apaga un canal o mejora tu plan para activar otro.",
    capOver: (active: number, cap: number) => `Tienes ${active} agentes activos y tu plan incluye ${cap}. Conservas los que ya tienes, pero no puedes activar más hasta apagar alguno o mejorar tu plan.`,
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
      AUTO: { label: "Automatic", hint: "Replies on its own only what your Rulebook covers; hands the rest to a person." },
    } as Record<AgentMode, { label: string; hint: string }>,
    confirmTitle: "Let the agent reply on its own on this channel?",
    confirmBody: "It will send replies to your customers without anyone reviewing them. It only answers what your Rulebook covers; if the customer complains, asks for a person or the agent is unsure, the conversation goes to your team. It never sends links or asks for payments. You can turn it off any time.",
    confirm: "Yes, turn on",
    cancel: "Cancel",
    noKey: "The server has no Claude key (ANTHROPIC_API_KEY): no drafts are generated meanwhile.",
    readOnly: "Only people who manage the knowledge base can change this.",
    capLine: (active: number, cap: number) => `Active agents: ${active} of ${cap} included in your plan`,
    capReached: "You reached your plan's agent cap: turn a channel off or upgrade your plan to turn another on.",
    capOver: (active: number, cap: number) => `You have ${active} active agents and your plan includes ${cap}. You keep the ones you have, but you can't turn more on until you turn one off or upgrade your plan.`,
    saved: "Saved",
    error: "Couldn't change the mode",
  },
};

const ICON = { OFF: Power, SUGGEST: Lightbulb, AUTO: Zap } as const;
const ORDER: AgentMode[] = ["OFF", "SUGGEST", "AUTO"];

export function AgentModesPanel({ initial, cap, canEdit, aiConfigured }: { initial: Record<string, AgentMode>; cap: { cap: number | null; overBy: number }; canEdit: boolean; aiConfigured: boolean }) {
  const { lang } = usePreferences();
  const t = COPY[lang === "en" ? "en" : "es"];
  const [modes, setModes] = useState(initial);
  const [pending, start] = useTransition();

  const [confirming, setConfirming] = useState<string | null>(null);
  const activeCount = Object.values(modes).filter((m) => m !== "OFF").length;
  const atCap = cap.cap !== null && activeCount >= cap.cap;

  function choose(channel: string, mode: AgentMode, confirmed = false) {
    if (!canEdit || pending || modes[channel] === mode) return;
    if (atCap && modes[channel] === "OFF") {
      toast.error(t.capReached);
      return;
    }
    if (mode === "AUTO" && !confirmed) {
      setConfirming(channel);
      return;
    }
    setConfirming(null);
    const previous = modes[channel];
    setModes((m) => ({ ...m, [channel]: mode }));
    start(async () => {
      try {
        await setAgentChannelMode(channel, mode, { confirmed });
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
        {cap.cap !== null && (
          <p role={atCap ? "status" : undefined} className={`rounded-card border p-2 text-xs ${activeCount > cap.cap ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
            {activeCount > cap.cap ? t.capOver(activeCount, cap.cap) : t.capLine(activeCount, cap.cap)}
            {activeCount === cap.cap && ` · ${t.capReached}`}
          </p>
        )}
        {!canEdit && <p className="text-xs text-slate-500">{t.readOnly}</p>}
        {Object.keys(initial).map((channel) => (
          <div key={channel} className="flex flex-col gap-2 rounded-card border border-slate-200 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{t.channels[channel] ?? channel}</p>
              <p className="text-xs text-slate-500">{t.modes[modes[channel]].hint}</p>
            </div>
            <div role="radiogroup" aria-label={t.channels[channel] ?? channel} className="inline-flex flex-shrink-0 rounded-lg bg-slate-100 p-0.5">
              {ORDER.map((mode) => {
                const Icon = ICON[mode];
                const active = modes[channel] === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!canEdit || pending}
                    title={t.modes[mode].hint}
                    onClick={() => choose(channel, mode)}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium motion-micro transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${active ? "bg-brand-600 text-[rgb(255_255_255)] shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {t.modes[mode].label}
                  </button>
                );
              })}
            </div>
            {confirming === channel && (
              <div role="alertdialog" aria-label={t.confirmTitle} className="w-full rounded-card border border-amber-200 bg-amber-50 p-3 sm:order-last">
                <p className="text-sm font-medium text-amber-900">{t.confirmTitle}</p>
                <p className="mt-1 text-xs text-amber-800">{t.confirmBody}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => choose(channel, "AUTO", true)} className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-[rgb(255_255_255)] hover:bg-brand-700">{t.confirm}</button>
                  <button type="button" onClick={() => setConfirming(null)} className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100">{t.cancel}</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
