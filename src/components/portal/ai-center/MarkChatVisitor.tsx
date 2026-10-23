"use client";
import { useEffect, useRef, useState } from "react";
import type { readPrivateVisitor } from "@/lib/ai/pilot/chat";
import { Button } from "@/components/ui/button";
type View = Awaited<ReturnType<typeof readPrivateVisitor>>;
export function MarkChatVisitor() {
  const [view, setView] = useState<View | null>(null), [content, setContent] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const token = useRef(""), pending = useRef<{ requestKey: string; content: string } | null>(null);
  useEffect(() => {
    token.current = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/mark-chat", { headers: { Authorization: `Bearer ${token.current}` }, cache: "no-store" });
        if (!response.ok) throw new Error("unavailable"); const data: View = await response.json();
        if (!stopped) setView(data);
      } catch { if (!stopped) setError("El chat no está disponible. Abre de nuevo el enlace original o solicita otro al operador."); }
      finally { if (!stopped) timer = setTimeout(poll, 2500); }
    }
    void poll(); return () => { stopped = true; clearTimeout(timer); };
  }, []);
  const closed = view?.status === "RESOLVED" || view?.status === "CLOSED";
  return <section className="min-w-0 space-y-4" aria-label="Website Chat privado">
    {!view && !error && <p role="status">Abriendo chat…</p>}
    {view && <><p className="rounded-lg bg-slate-50 p-3 text-sm">{closed ? "Conversación cerrada." : view.human || view.mode === "OFF" ? "La conversación está en atención humana." : view.mode === "AUTO" ? "Lía te responderá automáticamente; puedes pedir atención de una persona." : "Un operador revisará las respuestas antes de enviarlas."}</p><ol className="max-h-[55dvh] space-y-3 overflow-y-auto" aria-label="Mensajes del chat">{view.messages.map(m => <li key={m.id} className="break-words rounded-lg border border-slate-200 p-3"><p className="text-xs font-semibold">{m.role === "USER" ? "Tú" : "Equipo del negocio"}</p><p className="whitespace-pre-wrap">{m.content}</p></li>)}</ol></>}
    {error && <p role="alert" className="text-sm">{error}</p>}
    <form className="space-y-3" onSubmit={async event => {
      event.preventDefault(); if (busy || !content.trim()) return;
      if (pending.current?.content !== content.trim()) pending.current = { requestKey: crypto.randomUUID(), content: content.trim() };
      setBusy(true); setError("");
      try {
        const response = await fetch("/api/mark-chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.current}` }, body: JSON.stringify(pending.current) });
        if (!response.ok) throw new Error("unavailable"); setContent(""); pending.current = null;
      } catch { setError("No se pudo confirmar el mensaje. Puedes volver a enviar el mismo texto; no se duplicará."); }
      finally { setBusy(false); }
    }}><label className="block space-y-2"><span>Mensaje de prueba</span><textarea className="min-h-24 w-full rounded-md border border-slate-200 bg-transparent p-3 text-base" required maxLength={500} value={content} onChange={e => setContent(e.target.value)} disabled={busy || closed || !view} /></label><Button disabled={busy || closed || !view || !content.trim()}>{busy ? "Enviando…" : "Enviar mensaje"}</Button></form>
  </section>;
}
