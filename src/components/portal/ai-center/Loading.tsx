"use client";
import { usePreferences } from "@/context/preferences";
import { aiCenterCopy } from "@/lib/ai/agents/center-copy";
import { MetricGrid } from "@/components/shared/MetricGrid";
export function AiCenterLoading() {
  const { lang } = usePreferences(); const c = aiCenterCopy(lang);
  return <section role="status" aria-busy="true" aria-label={c.loading} className="min-w-0 space-y-5">
    <span className="sr-only">{c.loading}</span><div aria-hidden="true" className="h-7 w-1/2 rounded-md bg-slate-200 motion-safe:animate-pulse" />
    <MetricGrid columns={2}>{[1,2,3].map(n => <div aria-hidden="true" key={n} className="h-28 rounded-card bg-slate-100 motion-safe:animate-pulse" />)}</MetricGrid>
    <div aria-hidden="true" className="h-48 rounded-card bg-slate-100 motion-safe:animate-pulse" />
  </section>;
}
