"use client";
import { useState, useTransition } from "react";
import { setMarkChatMode } from "@/actions/mark-private-chat";
import { usePreferences } from "@/context/preferences";
import { Button } from "@/components/ui/button";
import type { AgentMode } from "@prisma/client";
export function MarkChatModeControl({ initial, onSaved }: { initial: { mode: AgentMode; version: number; canManage: boolean }; onSaved?: () => Promise<void> }) {
  const { lang } = usePreferences(), es = lang === "es";
  const [mode, setMode] = useState(initial.mode), [version, setVersion] = useState(initial.version), [saved, setSaved] = useState(initial.mode), [confirmed, setConfirmed] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, start] = useTransition();
  const labels: Record<AgentMode, string> = es ? { OFF: "Desactivado", SUGGEST: "Con aprobación", AUTO: "Autónomo" } : { OFF: "Disabled", SUGGEST: "With approval", AUTO: "Autonomous" };
  return <section className="min-w-0 space-y-3" aria-label={es ? "Modo de Lía en Website Chat privado" : "Lía mode in private Website Chat"}>
    <h3 className="font-semibold">{es ? "Lía · piloto privado" : "Lía · private pilot"}</h3>
    <p className="text-sm text-slate-600">{es ? "Se aplica a todas las conversaciones del piloto privado de este negocio. Las conexiones comerciales conservan su configuración." : "Applies to every private pilot conversation for this business. Commercial connections keep their configuration."}</p>
    <p className="text-sm font-medium">{es ? "Modo actual" : "Current mode"}: {labels[saved]}</p>
    <label className="block space-y-2"><span>{es ? "Modo de Lía" : "Lía mode"}</span><select aria-label={es ? "Modo de Lía" : "Lía mode"} className="min-h-11 w-full rounded-md border border-slate-200 bg-transparent px-3 text-base" value={mode} disabled={busy || !initial.canManage} onChange={e => { setMode(e.target.value as AgentMode); setConfirmed(false); setNotice(""); }}>{(["OFF", "SUGGEST", "AUTO"] as const).map(m => <option key={m} value={m}>{labels[m]}</option>)}</select></label>
    <p className="text-sm">{mode === "OFF" ? (es ? "No genera ni envía respuestas de IA. Puedes atender manualmente." : "No AI generation or sending. You can reply manually.") : mode === "AUTO" ? (es ? "Lía responde a los mensajes nuevos. Si falta información, falla la IA o el cliente pide una persona, pasa a atención humana." : "Lía replies to new messages. Missing information, AI failures or requests for a person go to your team.") : (es ? "Solicitas una propuesta, la revisas y decides cuándo enviarla." : "Request a draft, review it and decide when to send.")}</p>
    {mode === "AUTO" && saved !== "AUTO" && <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>{es ? "Confirmo que usaré datos ficticios y autorizo respuestas sin revisión previa y consumo de IA, con topes de $25 MXN diarios, $500 por ciclo y $1 por turno." : "I confirm fictional data and authorize replies without prior review and AI usage, capped at MXN $25 daily, $500 per cycle and $1 per turn."}</span></label>}
    {initial.canManage && <Button className="h-auto min-h-11 whitespace-normal" disabled={busy || mode === saved || mode === "AUTO" && !confirmed} onClick={() => { setError(""); start(async () => { try { const result = await setMarkChatMode({ mode, version, ...(mode === "AUTO" ? { confirmCost: true, confirmFictional: true } : {}) }); setSaved(result.mode); setVersion(result.version); setConfirmed(false); setNotice(es ? "Modo guardado. Se aplicará a los mensajes nuevos." : "Mode saved. It applies to new messages."); await onSaved?.(); } catch { setError(es ? "No se pudo guardar. Actualiza la página; la configuración pudo cambiar o falta preparar presupuesto y fuentes del piloto." : "Could not save. Refresh the page; configuration may have changed or pilot budget and sources still need setup."); } }); }}>{es ? "Guardar modo de Lía" : "Save Lía mode"}</Button>}
    {notice && <p role="status" className="text-sm">{notice}</p>}{error && <p role="alert" className="text-sm">{error}</p>}
  </section>;
}
