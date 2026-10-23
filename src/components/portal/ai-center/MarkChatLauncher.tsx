"use client";
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createMarkChat } from "@/actions/mark-private-chat";
import { Button } from "@/components/ui/button";
export function MarkChatLauncher() {
  const [confirmed, setConfirmed] = useState(false), [busy, start] = useTransition(), [chat, setChat] = useState<Awaited<ReturnType<typeof createMarkChat>> | null>(null), [error, setError] = useState("");
  const requestKey = useRef("");
  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-4">
    <p>El enlace abre un visitante ficticio de Website Chat. Los mensajes aparecen en Conversaciones. Crear el enlace no consume IA. En modo Autónomo, los mensajes nuevos generan respuestas con consumo de IA; en Con aprobación, el operador solicita y aprueba los borradores. Puedes cambiar el modo en Canales o dentro de la conversación.</p>
    <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} /><span>Confirmo que este piloto usará solo información ficticia.</span></label>
    <Button disabled={busy || !confirmed || !!chat} onClick={() => { setError(""); requestKey.current ||= crypto.randomUUID(); start(async () => { try { setChat(await createMarkChat({ requestKey: requestKey.current, confirmFictional: true })); } catch { setError("No se pudo crear el piloto. Revisa permisos y configuración de staging."); } }); }}>Crear conversación privada</Button>
    {error && <p role="alert">{error}</p>}
    {chat && <div role="status" className="space-y-3"><p>Conversación creada. El enlace caduca en una hora; consérvalo solo para esta prueba.</p>{chat.visitorUrl ? <a className="block underline" href={chat.visitorUrl} target="_blank" rel="noopener noreferrer">Abrir ventana del visitante</a> : <p>Abre la conversación del operador para renovar el enlace privado.</p>}<Link className="block underline" href={`/portal/conversations/${chat.conversationId}`}>Abrir conversación del operador</Link></div>}
  </section>;
}
