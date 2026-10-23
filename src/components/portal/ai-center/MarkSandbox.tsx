"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { startMarkSandbox, runMarkSandboxPreview, getMarkSandbox, stopMarkSandbox } from "@/actions/mark-sandbox";
import type { SandboxInput, Step, StopCode } from "@/lib/ai/mark/contract";
import { getErrorMessage } from "@/lib/user-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
type Run = Awaited<ReturnType<typeof startMarkSandbox>>;
const reasons: Record<StopCode, [string, string]> = {
  human_requested: ["El cliente pidió ayuda de una persona.", "The customer requested human help."],
  insufficient_information: ["Falta información para responder.", "There is not enough information to answer."],
  tool_denied: ["La consulta no tiene permiso en esta prueba.", "This test does not allow that read."],
  invalid_model_output: ["La decisión de prueba no tiene un formato válido.", "The test decision has an invalid format."],
  limit_reached: ["Se alcanzó el límite de pasos o consultas.", "The step or read limit was reached."],
  timeout: ["La prueba tardó demasiado y se detuvo.", "The test took too long and was stopped."],
  cancelled: ["La prueba se detuvo.", "The test was stopped."],
  authority_changed: ["La prueba se detuvo porque cambió el acceso.", "The test stopped because access changed."],
  provider_failed: ["No se pudo completar la decisión de prueba.", "The test decision could not be completed."],
  unsafe_reply: ["La respuesta requiere revisión de una persona.", "The reply needs human review."],
};
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export function MarkSandbox({ lang }: { lang: "es" | "en" }) {
  const es = lang === "es", epoch = useRef(0), active = useRef<string | null>(null);
  const [question, setQuestion] = useState(es ? "¿Cuál es el horario?" : "What are the opening hours?");
  const [channel, setChannel] = useState<SandboxInput["channel"]>("webchat"), [knowledge, setKnowledge] = useState(true), [customer, setCustomer] = useState(false);
  const [busy, setBusy] = useState(false), [run, setRun] = useState<Run | null>(null), [error, setError] = useState("");
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  useEffect(() => () => { ++epoch.current; }, []);
  const inFlight = run?.status === "RUNNING" || run?.status === "QUEUED";
  const steps = Array.isArray(run?.trace) ? run.trace as unknown as Step[] : [];
  const reason = run?.result?.reason;
  function fail(error: unknown) {
    const fallback = es ? "No se pudo completar la prueba. Puedes consultar su estado o detenerla." : "Could not complete the test. You can refresh its status or stop it.";
    const digest = (error as { digest?: unknown } | null)?.digest;
    setError(typeof digest === "string" && digest.startsWith("reymen-user-error:") ? getErrorMessage(error, fallback) : fallback);
  }
  async function submit() {
    if (!ready || busy || inFlight || !question.trim()) return;
    const turn = ++epoch.current, input: SandboxInput = { mode: "simulation", question: question.trim(), channel, permissions: { knowledge, customer } };
    setBusy(true); setError(""); setRun(null);
    try {
      const prepared = await startMarkSandbox(input, crypto.randomUUID());
      if (turn !== epoch.current) { await stopMarkSandbox(prepared.id).catch(() => undefined); return; }
      active.current = prepared.id; setRun(prepared);
      const result = await runMarkSandboxPreview(prepared.id, input);
      if (turn === epoch.current) setRun(result);
    } catch (error) { if (turn === epoch.current) fail(error); }
    finally { if (turn === epoch.current) setBusy(false); }
  }
  async function refresh() {
    if (!active.current || busy) return;
    const turn = epoch.current; setBusy(true); setError("");
    try { const result = await getMarkSandbox(active.current); if (turn === epoch.current) setRun(result); }
    catch (error) { if (turn === epoch.current) fail(error); }
    finally { if (turn === epoch.current) setBusy(false); }
  }
  async function reset() {
    const turn = ++epoch.current; setBusy(true); setError("");
    try {
      if (active.current) await stopMarkSandbox(active.current);
      if (turn === epoch.current) { active.current = null; setRun(null); }
    } catch (error) { if (turn === epoch.current) fail(error); }
    finally { if (turn === epoch.current) setBusy(false); }
  }
  return <section aria-labelledby="mark-sandbox-title" className="mt-6 min-w-0 space-y-3">
    <h2 id="mark-sandbox-title" className="text-lg font-semibold text-slate-900">{es ? "Lía · pruebas con datos de ejemplo" : "Lía · tests with sample data"}</h2>
    <Card><CardContent className="min-w-0 space-y-4 p-4">
      <p className="rounded-md bg-brand-50 p-3 text-sm text-brand-900">{es ? "Simulación sin consumo de tu plan. Usa únicamente información ficticia: no consulta tus clientes, no envía mensajes y no activa Lía en ningún canal. No evalúa un modelo ni una conexión real." : "Simulation with no plan usage. Uses fictional information only: it does not read your customers, send messages or enable Lía on any channel. It does not evaluate a model or a real connection."}</p>
      <form className="min-w-0 space-y-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <div className="space-y-2"><Label htmlFor="mark-question">{es ? "Pregunta de prueba" : "Test question"}</Label><Textarea id="mark-question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={1000} rows={3} className="text-base" disabled={!ready || busy || inFlight} /></div>
        <div className="min-w-0 space-y-2"><Label htmlFor="mark-channel">{es ? "Canal simulado" : "Simulated channel"}</Label><select id="mark-channel" value={channel} onChange={e => setChannel(e.target.value as SandboxInput["channel"])} disabled={!ready || busy || inFlight} className="min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-white px-3 text-base"><option value="webchat">Website Chat</option><option value="whatsapp">WhatsApp</option></select></div>
        <fieldset disabled={!ready || busy || inFlight} className="space-y-2"><legend className="text-sm font-medium">{es ? "Consultas permitidas en esta prueba" : "Allowed reads for this test"}</legend><label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={knowledge} onChange={e => setKnowledge(e.target.checked)} className="h-5 w-5" />{es ? "Consultar horarios y precios ficticios" : "Read fictional hours and prices"}</label><label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={customer} onChange={e => setCustomer(e.target.checked)} className="h-5 w-5" />{es ? "Consultar compras del cliente ficticio" : "Read purchases of the fictional customer"}</label></fieldset>
        <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={!ready || busy || inFlight || !question.trim()}>{!ready ? (es ? "Preparando prueba…" : "Preparing test…") : busy ? (es ? "Procesando…" : "Processing…") : (es ? "Probar Lía" : "Test Lía")}</Button><Button className="min-h-11" type="button" variant="outline" disabled={!ready} onClick={reset}>{es ? "Detener y limpiar" : "Stop and clear"}</Button>{inFlight && !busy && <Button className="min-h-11" type="button" variant="outline" onClick={refresh}>{es ? "Consultar estado" : "Refresh status"}</Button>}</div>
      </form>
      <p className="text-xs text-slate-500">{es ? "Límites: 4 pasos, 2 decisiones simuladas, 2 consultas y 5 segundos de ejecución. La pregunta no se guarda; se conserva una traza sin su texto." : "Limits: 4 steps, 2 simulated decisions, 2 reads and 5 seconds of execution. The question is not stored; a trace without its text is retained."}</p>
      {error && <p role="alert" className="break-words rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {run && <div role="status" aria-label={es ? "Resultado de prueba de Lía" : "Lía test result"} className="min-w-0 space-y-3 rounded-md border border-slate-200 p-3">
        <p className="text-sm font-medium">{run.status === "SUCCEEDED" ? (es ? "Respuesta de ejemplo" : "Sample reply") : inFlight ? (es ? "Prueba en curso" : "Test in progress") : run.status === "CANCELLED" ? (es ? "Prueba detenida" : "Test stopped") : (es ? "Lo pasaría a una persona" : "Would hand over to a person")}</p>
        {run.result?.reply && <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{run.result.reply}</p>}
        {reason && reasons[reason] && <p className="text-sm text-slate-600">{reasons[reason][es ? 0 : 1]}</p>}
        <p className="text-xs text-slate-500">{steps.length} {es ? "pasos registrados · Sin mensajes enviados" : "recorded steps · No messages sent"}</p>
        <details><summary className="min-h-11 cursor-pointer text-sm text-brand-700">{es ? "Ver pasos de la prueba" : "View test steps"}</summary><ol className="space-y-2 text-sm text-slate-600">{steps.map(step => <li key={step.number}>{step.number}. {step.kind === "decision" ? (es ? "Decisión simulada" : "Simulated decision") : step.tool === "customer.summary" ? (es ? "Consultar cliente ficticio" : "Read fictional customer") : (es ? "Consultar información de ejemplo" : "Read sample information")}{step.status === "denied" ? (es ? " · bloqueada" : " · blocked") : ""}</li>)}</ol></details>
      </div>}
    </CardContent></Card>
  </section>;
}
