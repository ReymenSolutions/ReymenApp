"use client";
import { usePreferences } from "@/context/preferences";
import { aiCenterCopy } from "@/lib/ai/agents/center-copy";
import { Button } from "@/components/ui/button";
export function AiCenterError({ reset }: { error?: Error & { digest?: string }; reset: () => void }) {
  const { lang } = usePreferences(); const c = aiCenterCopy(lang);
  return <section role="alert" className="min-w-0 space-y-4 rounded-card border border-slate-200 bg-white p-5"><h1 className="text-lg font-semibold text-slate-900">{c.error}</h1><p className="text-sm text-slate-600">{c.errorHelp}</p><Button className="min-h-11" onClick={reset}>{c.retry}</Button></section>;
}
