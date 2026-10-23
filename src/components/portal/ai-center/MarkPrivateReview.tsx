"use client";
import { useState, useTransition } from "react";
import { testPrivateMark } from "@/actions/mark-private-review";
import { Button } from "@/components/ui/button";
type Result = Awaited<ReturnType<typeof testPrivateMark>>;
export function MarkPrivateReview() {
  const [question, setQuestion] = useState(""), [fictional, setFictional] = useState(false), [cost, setCost] = useState(false), [busy, start] = useTransition();
  const [result, setResult] = useState<Result | null>(null), [error, setError] = useState(""), [used, setUsed] = useState(false);
  return <section className="min-w-0 space-y-4 rounded-xl border border-slate-200 p-4" aria-label="Prueba privada de Lía con Anthropic">
    <p>Esta prueba puede generar un cargo real de Anthropic. Produce un borrador para revisión interna; no envía mensajes ni consulta clientes, compras o recompensas.</p>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (busy || used) return; const requestKey = crypto.randomUUID(); setUsed(true); setResult(null); setError(""); start(async () => { try { setResult(await testPrivateMark({ requestKey, question, confirmFictional: fictional as true, confirmCost: cost as true })); } catch { setError("No se pudo completar o cambió la autorización. No se repetirá la llamada. Si el costo es incierto, la reserva se conserva y un administrador debe revisarla en el panel del piloto."); } }); }}>
      <label className="block space-y-2"><span>Pregunta ficticia</span><textarea className="min-h-28 w-full rounded-md border border-slate-200 bg-transparent p-3 text-base" required maxLength={500} value={question} onChange={e => setQuestion(e.target.value)} disabled={busy || used} /></label>
      <label className="flex min-h-11 items-start gap-3"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" required checked={fictional} onChange={e => setFictional(e.target.checked)} disabled={busy || used} /><span>Confirmo que la pregunta y las fuentes contienen únicamente información ficticia, sin datos personales.</span></label>
      <label className="flex min-h-11 items-start gap-3"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" required checked={cost} onChange={e => setCost(e.target.checked)} disabled={busy || used} /><span>Autorizo esta prueba pagada, sujeta a los límites de $25 MXN diarios, $500 por ciclo y $1 por turno.</span></label>
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || used || !fictional || !cost || !question.trim()}>{busy ? "Generando borrador…" : "Probar con Anthropic"}</Button><Button type="button" variant="outline" disabled={busy || !used} onClick={() => { setResult(null); setError(""); setUsed(false); setFictional(false); setCost(false); }}>Preparar otra prueba</Button></div>
    </form>
    {error && <p role="alert">{error}</p>}
    {result && <div role="status" className="min-w-0 space-y-3 rounded-lg bg-slate-50 p-4">
      <p className="font-semibold">{result.kind === "no_sources" ? "No hay fuentes autorizadas que respondan esta pregunta. No se llamó a Anthropic." : result.kind === "refused" ? "El proveedor rechazó la respuesta. El consumo puede ser facturable." : "Borrador: requiere revisión humana"}</p>
      {result.text && <p className="whitespace-pre-wrap break-words">{result.text}</p>}
      {"costMxn" in result && <p className="text-sm">Costo estimado de esta llamada: {result.costMxn ?? "pendiente"} MXN. No es una factura.</p>}
      {!!result.sources.length && <ul className="list-inside list-disc text-sm">{result.sources.map(s => <li key={s.articleId}>{s.title} · versión {s.version}</li>)}</ul>}
    </div>}
  </section>;
}
