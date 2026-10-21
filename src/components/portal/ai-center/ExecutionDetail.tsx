"use client";
import { useRef, useState } from "react";
import { getAgentExecutionTrace } from "@/actions/ai-agents";
import { aiCenterCopy, executionLabel } from "@/lib/ai/agents/center-copy";
import { usePreferences } from "@/context/preferences";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
export function ExecutionDetail({ id }: { id: string }) {
  const { lang } = usePreferences(); const c = aiCenterCopy(lang); const request = useRef(0);
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [failed, setFailed] = useState(false);
  const [trace, setTrace] = useState<Awaited<ReturnType<typeof getAgentExecutionTrace>> | null>(null);
  async function load() { const token = ++request.current; setOpen(true); setLoading(true); setFailed(false); setTrace(null);
    try { const result = await getAgentExecutionTrace(id); if (token === request.current) setTrace(result); }
    catch { if (token === request.current) setFailed(true); } finally { if (token === request.current) setLoading(false); }
  }
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) ++request.current; }}><DialogTrigger asChild><Button type="button" variant="outline" className="min-h-11" onClick={load}>{c.details}</Button></DialogTrigger><DialogContent touchClose closeLabel={lang === "es" ? "Cerrar ventana" : "Close dialog"} className="min-w-0 [overflow-wrap:anywhere]">
      <DialogHeader className="pr-10"><DialogTitle>{c.activity}</DialogTitle><DialogDescription>{c.observation}</DialogDescription></DialogHeader>
      <div aria-busy={loading} aria-live="polite">{loading && <p>{c.loading}</p>}{failed && <div role="alert" className="space-y-3"><p>{c.retryTrace}</p><Button type="button" className="min-h-11" onClick={load}>{c.retry}</Button></div>}
        {trace && <div className="space-y-4"><p className="font-semibold">{executionLabel(trace.status, lang)}</p><p className="text-sm text-slate-600">{c.revision}: {trace.configVersion}</p><ol className="space-y-3">{trace.steps.map(step => <li key={step.stepKey} className="rounded-md border border-slate-200 p-3"><p className="text-sm font-medium">{executionLabel(step.stepKey, lang)}</p><p className="text-sm text-slate-600">{executionLabel(step.status, lang)}</p></li>)}</ol><p className="text-xs text-slate-500">{c.deliveredNote}</p></div>}
      </div><Button variant="outline" type="button" className="min-h-11" onClick={() => { ++request.current; setOpen(false); }}>{c.close}</Button>
    </DialogContent></Dialog>;
}
