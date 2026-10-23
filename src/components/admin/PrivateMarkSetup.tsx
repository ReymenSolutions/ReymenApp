"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignPrivateMarkSource, enablePrivateMarkReview } from "@/actions/mark-private-review";
import type { getPrivateReviewSetup } from "@/lib/ai/pilot/review";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export function PrivateMarkSetup({ organizationId, budgetVersion, setup }: { organizationId: string; budgetVersion: number | null; setup: Awaited<ReturnType<typeof getPrivateReviewSetup>> }) {
  const router = useRouter(), [busy, start] = useTransition(), [notice, setNotice] = useState(""), [selection, setSelection] = useState(""), [confirmed, setConfirmed] = useState(false);
  function perform(work: () => Promise<unknown>) { start(async () => { setNotice(""); try { await work(); setNotice("Configuración guardada. No se envió ningún mensaje."); router.refresh(); } catch { setNotice("No se pudo guardar. Actualiza la página y revisa permisos, fuentes publicadas y configuración privada."); } }); }
  return <Card className="min-w-0"><CardHeader><CardTitle>Conocimiento y prueba privada con Anthropic</CardTitle></CardHeader><CardContent className="min-w-0 space-y-4">
    <p className="text-sm">Publica primero los artículos ficticios desde la base de conocimiento del negocio. Aquí asignas una versión concreta a Mark. No se copian permisos del asistente anterior.</p>
    <label className="block space-y-2"><span>Fuente publicada para Mark</span><select className="min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-transparent px-3 text-base" value={selection} onChange={e => setSelection(e.target.value)} disabled={busy || !budgetVersion}><option value="">Selecciona un artículo publicado</option>{setup.published.map((r, i) => <option key={`${r.articleId}:${r.version}`} value={String(i)}>{r.title} · versión {r.version}</option>)}</select></label>
    {!setup.published.length && <p className="text-sm">Aún no hay versiones publicadas. Un borrador no se puede usar en esta prueba.</p>}
    <Button className="h-auto min-h-11 max-w-full whitespace-normal" disabled={busy || selection === "" || !budgetVersion} onClick={() => { const source = setup.published[Number(selection)]; if (source) perform(() => assignPrivateMarkSource({ organizationId, articleId: source.articleId, version: source.version, policyVersion: setup.knowledgeVersion })); }}>Asignar versión a Mark</Button>
    <p className="break-words text-sm">Fuentes activas para Mark: {setup.grants.length}. Modelo configurado: {setup.model || "pendiente"}.</p>
    {!setup.configured && <p className="text-sm">La conexión privada todavía necesita su configuración en el VPS. No introduzcas claves en esta pantalla.</p>}
    <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} /><span>Autorizo pruebas pagadas con información ficticia: hasta $25 MXN al día, $500 por ciclo y $1 por turno. También se aplica el presupuesto general del negocio.</span></label>
    <Button className="h-auto min-h-11 max-w-full whitespace-normal" disabled={busy || !confirmed || !setup.ready || !budgetVersion} onClick={() => perform(() => enablePrivateMarkReview({ organizationId, policyVersion: budgetVersion!, confirmCost: true }))}>Habilitar admisión de pruebas privadas</Button>
    <p className="text-sm">Después, el propietario usa <a className="underline" href="/portal/mark-pilot">/portal/mark-pilot</a> para revisar borradores. Esto no habilita ningún canal ni consulta el CRM.</p>
    {notice && <p role="status" className="break-words text-sm">{notice}</p>}
  </CardContent></Card>;
}
