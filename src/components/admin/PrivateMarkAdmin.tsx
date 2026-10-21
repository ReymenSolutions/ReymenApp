"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { preparePrivateMarkAction, pausePrivateMarkAction, closePrivateMarkRootAction, reconcilePrivateMarkAction } from "@/actions/mark-pilot-admin";
import type { PrivatePilotAdminView } from "@/lib/ai/pilot/admin";

export function PrivateMarkAdmin({ view, lang, page }: { view: PrivatePilotAdminView; lang: string; page: number }) {
  const es = lang === "es", router = useRouter(), [busy, start] = useTransition(), [notice, setNotice] = useState("");
  const organization = view.organization;
  const money = (n: number | string) => new Intl.NumberFormat(es ? "es-MX" : "en-US", { style: "currency", currency: "MXN" }).format(Number(n));
  function perform(work: () => Promise<unknown>) {
    setNotice("");
    start(async () => {
      try { await work(); setNotice(es ? "Cambio guardado. El piloto conserva sus controles de seguridad." : "Saved. Pilot safety controls remain in place."); router.refresh(); }
      catch { setNotice(es ? "No se pudo completar. Actualiza la página, revisa permisos y evidencia; una operación incierta conserva su reserva." : "Could not complete. Refresh and check permissions and evidence; uncertain work keeps its reservation."); }
    });
  }
  return <div className="min-w-0 space-y-5">
    <p className="rounded-lg bg-brand-50 p-4 text-sm text-brand-900">{es ? "Solo entorno de pruebas. Preparar Mark lo deja pausado y no llama a Anthropic, consulta clientes ni envía mensajes. Las pruebas actuales del laboratorio siguen siendo simuladas." : "Staging only. Preparing Mark leaves it paused and does not call Anthropic, read customers or send messages. Current lab tests remain simulated."}</p>
    <form method="get" action="/admin/ai-pilot" className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1 space-y-2"><Label htmlFor="pilot-organization">{es ? "Negocio de prueba" : "Test business"}</Label><select id="pilot-organization" name="organization" defaultValue={organization?.id} className="min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-base">{view.organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></div>
      <Button type="submit" className="min-h-11" disabled={!view.organizations.length || busy}>{es ? "Ver estado" : "View status"}</Button>
    </form>
    {notice && <p role="status" className="break-words rounded-lg border border-slate-200 p-3 text-sm">{notice}</p>}
    {!organization ? <p className="rounded-lg border border-slate-200 p-4">{es ? "Todavía no hay negocios de prueba disponibles." : "No test businesses are available yet."}</p> : <>
      <Card><CardHeader><CardTitle>{es ? "1. Preparar Mark" : "1. Prepare Mark"}</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-sm text-slate-600">{view.instance ? (es ? "Instancia preparada. La entrega de mensajes continúa desactivada." : "Instance prepared. Message delivery remains disabled.") : (es ? "Crea una configuración privada para este negocio, con revisión humana y sin acceso a compras de clientes." : "Create a private configuration for this business, with human review and no customer-purchase access.")}</p>
        {!organization.moduleEnabled && <p className="text-sm text-amber-800">{es ? "Este negocio necesita acceso al módulo de asistentes IA." : "This business needs the AI assistant module."}</p>}
        <Button className="min-h-11" disabled={busy || !!view.instance || !organization.moduleEnabled} onClick={() => perform(() => preparePrivateMarkAction({ organizationId: organization.id }))}>{view.instance ? (es ? "Mark preparado" : "Mark prepared") : (es ? "Preparar Mark pausado" : "Prepare paused Mark")}</Button>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{es ? "2. Revisar presupuesto" : "2. Review budget"}</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 [&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-3 sm:[&>*:last-child:nth-child(odd)]:col-span-1">
          {[[es ? "Por día" : "Per day", 25], [es ? "Por ciclo mensual" : "Per monthly cycle", 500], [es ? "Por turno" : "Per turn", 1]].map(([label, amount]) => <div key={String(label)} className="min-w-0 rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-600">{label}</p><p className="break-words text-lg font-semibold">{money(amount)}</p></div>)}
        </div>
        <p className="text-sm text-slate-600">{es ? "El presupuesto general del negocio también se respeta; siempre manda el límite menor. Las llamadas inciertas mantienen capacidad reservada." : "The business's overall budget also applies; the lower limit always wins. Uncertain calls retain reserved capacity."}</p>
        {view.budget && <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3"><div><dt>{es ? "Consumo registrado del negocio" : "Recorded business usage"}</dt><dd className="font-semibold">{money(view.budget.spentMxn)}</dd></div><div><dt>{es ? "Capacidad reservada" : "Reserved capacity"}</dt><dd className="font-semibold">{money(view.budget.reservedMxn)}</dd></div><div><dt>{es ? "Disponible general" : "Overall remaining"}</dt><dd className="font-semibold">{money(view.budget.remainingMxn)}</dd></div></dl>}
        <p className="text-sm font-medium">{view.policy?.enabled ? (es ? "Admisión del piloto habilitada" : "Pilot admission enabled") : (es ? "Admisión del piloto pausada" : "Pilot admission paused")}</p>
        {view.policy?.enabled && <Button variant="outline" disabled={busy} onClick={() => perform(() => pausePrivateMarkAction({ organizationId: organization.id, version: view.policy!.version }))}>{es ? "Pausar nuevas pruebas" : "Pause new tests"}</Button>}
        <p className="text-sm text-slate-600">{es ? "La activación de pruebas pagadas llegará con la conexión revisada de Mark al proveedor y sus fuentes. Agregar una clave no completa esa conexión." : "Paid-test activation will arrive with the reviewed Mark connection to the provider and its sources. Adding a key does not complete that connection."}</p>
      </CardContent></Card>
      <Card><CardHeader><CardTitle>{es ? "3. Revisar operaciones pendientes" : "3. Review pending operations"}</CardTitle></CardHeader><CardContent className="space-y-4">
        {!view.pendingCount ? <p className="text-sm text-slate-600">{es ? "No hay llamadas pendientes de revisión." : "No calls need review."}</p> : <>
          <p className="text-sm">{view.pendingCount} {es ? "llamadas con resultado incierto. No se repetirán automáticamente." : "calls have an uncertain outcome. They will not be repeated automatically."}</p>
          {view.pending.map(row => <details key={row.id} className="min-w-0 rounded-lg border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer break-words text-sm">{es ? "Llamada" : "Call"} {row.pilotStep} · {new Date(row.createdAt).toLocaleString(es ? "es-MX" : "en-US")} · {row.model}</summary><EvidenceForm usageId={row.id} model={row.model} organizationId={organization.id} es={es} busy={busy} perform={perform} /></details>)}
          <div className="flex flex-wrap gap-3 text-sm">{page > 0 && <Link href={`/admin/ai-pilot?organization=${encodeURIComponent(organization.id)}&page=${page - 1}`}>{es ? "Anterior" : "Previous"}</Link>}{(page + 1) * 10 < view.pendingCount && <Link href={`/admin/ai-pilot?organization=${encodeURIComponent(organization.id)}&page=${page + 1}`}>{es ? "Siguiente" : "Next"}</Link>}</div>
        </>}
        {!!view.roots.length && <details><summary className="min-h-11 cursor-pointer text-sm">{es ? "Reservas de turnos abiertos (hasta 20)" : "Open turn reservations (up to 20)"}</summary><div className="space-y-3">{view.roots.map(root => <div key={root.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><p className="min-w-0 break-all text-xs">{root.id}<br />{money(root.holdMxn)}</p><Button variant="outline" disabled={busy} onClick={() => perform(() => closePrivateMarkRootAction({ organizationId: organization.id, rootId: root.id }))}>{es ? "Cerrar turno conciliado" : "Close reconciled turn"}</Button></div>)}<p className="text-xs text-slate-600">{es ? "Un turno con costo desconocido no se puede cerrar ni liberar." : "A turn with unknown cost cannot be closed or released."}</p></div></details>}
      </CardContent></Card>
    </>}
  </div>;
}

function EvidenceForm({ usageId, model, organizationId, es, busy, perform }: { usageId: string; model: string; organizationId: string; es: boolean; busy: boolean; perform: (work: () => Promise<unknown>) => void }) {
  const [kind, setKind] = useState<"PROVIDER_USAGE" | "PROVIDER_NO_CHARGE">("PROVIDER_USAGE");
  return <form className="mt-3 space-y-3" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const token = (key: string) => kind === "PROVIDER_NO_CHARGE" ? 0 : Number(form.get(key));
    perform(() => reconcilePrivateMarkAction({ organizationId, usageId, confirmEvidence: form.get("confirm") === "on", evidence: {
      kind, reference: String(form.get("reference")), externalId: String(form.get("externalId")),
      modelServed: kind === "PROVIDER_USAGE" ? String(form.get("model")) : undefined,
      outcome: kind === "PROVIDER_NO_CHARGE" ? "FAILED" : form.get("outcome") === "REFUSED" ? "REFUSED" : form.get("outcome") === "FAILED" ? "FAILED" : "SUCCEEDED",
      usage: { inputTokens: token("inputTokens"), outputTokens: token("outputTokens"), cacheReadTokens: token("cacheReadTokens"), cacheWriteTokens: token("cacheWriteTokens"), reasoningTokens: token("reasoningTokens") },
    } }));
  }}>
    <p className="text-sm text-slate-600">{es ? "Solo administración: usa un comprobante revisado de Anthropic. No pegues claves, preguntas ni respuestas de clientes. Un timeout no demuestra que la llamada fue gratuita." : "Administrators only: use reviewed Anthropic evidence. Do not paste keys or customer questions/responses. A timeout does not prove a call was free."}</p>
    <Label className="block space-y-2"><span>{es ? "Qué confirma el proveedor" : "What the provider confirms"}</span><select value={kind} disabled={busy} onChange={e => setKind(e.target.value as typeof kind)} className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base"><option value="PROVIDER_USAGE">{es ? "Consumo reportado" : "Reported usage"}</option><option value="PROVIDER_NO_CHARGE">{es ? "Confirmación de que no hubo cobro" : "Confirmed no charge"}</option></select></Label>
    <Label className="block space-y-2"><span>{es ? "Referencia del comprobante (sin información personal)" : "Evidence reference (no personal information)"}</span><Input name="reference" required minLength={8} maxLength={120} disabled={busy} autoComplete="off" /></Label>
    <Label className="block space-y-2"><span>{es ? "ID de Anthropic (msg_ o req_)" : "Anthropic ID (msg_ or req_)"}</span><Input name="externalId" required maxLength={124} disabled={busy} autoComplete="off" /></Label>
    {kind === "PROVIDER_USAGE" && <><Label className="block space-y-2"><span>{es ? "Modelo que reporta el comprobante" : "Model in the evidence"}</span><Input name="model" required defaultValue={model} maxLength={120} disabled={busy} /></Label><Label className="block space-y-2"><span>{es ? "Resultado confirmado" : "Confirmed outcome"}</span><select name="outcome" className="min-h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-base" disabled={busy}><option value="SUCCEEDED">{es ? "Respuesta generada" : "Response generated"}</option><option value="REFUSED">{es ? "Respuesta rechazada por el modelo" : "Model refusal"}</option><option value="FAILED">{es ? "Fallo con consumo confirmado" : "Failure with confirmed usage"}</option></select></Label><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[["inputTokens", es ? "Tokens de entrada" : "Input tokens"], ["outputTokens", es ? "Tokens de salida" : "Output tokens"], ["cacheReadTokens", es ? "Tokens leídos de caché" : "Cache-read tokens"], ["cacheWriteTokens", es ? "Tokens escritos en caché" : "Cache-write tokens"], ["reasoningTokens", es ? "Tokens de razonamiento separados" : "Separate reasoning tokens"]].map(([key, label]) => <Label key={key} className="block space-y-2"><span>{label}</span><Input name={key} type="number" min={0} max={2147483647} step={1} required disabled={busy} /></Label>)}</div></>}
    <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1 h-5 w-5 shrink-0" name="confirm" type="checkbox" required disabled={busy} /><span>{es ? "Revisé el comprobante y confirmo estos datos. Esta acción actualiza la contabilidad del piloto y queda auditada." : "I reviewed the evidence and confirm these details. This updates pilot accounting and is audited."}</span></label>
    <Button type="submit" disabled={busy} className="min-h-11">{es ? "Guardar conciliación" : "Save reconciliation"}</Button>
  </form>;
}
