import Link from "next/link";
import { Bot } from "lucide-react";
import type { AgentMode } from "@prisma/client";
import type { Lang } from "@/lib/i18n";
import { aiCenterCopy, channelLabel } from "@/lib/ai/agents/center-copy";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
export function AssistantCard({ name, modes, canEdit, lang }: { name: string; modes: Record<string, AgentMode>; canEdit: boolean; lang: Lang }) {
  const c = aiCenterCopy(lang);
  return <Card className="min-w-0">
    <CardHeader><div className="flex items-start gap-3"><Bot className="mt-1 h-5 w-5 shrink-0 text-brand-600" aria-hidden="true" /><div className="min-w-0"><CardTitle className="break-words">{name}</CardTitle><p className="mt-1 text-sm text-slate-500">{c.existing}</p></div></div></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-slate-600">{c.shared}</p>
      <ul className="flex flex-wrap gap-2" aria-label={c.modes}>{Object.entries(modes).map(([channel, mode]) => <li key={channel}><Badge variant="secondary" className="h-auto whitespace-normal">{channelLabel(channel, lang)} · {mode === "AUTO" ? c.auto : mode === "SUGGEST" ? c.suggest : c.off}</Badge></li>)}</ul>
      <Link className={buttonVariants({ className: "min-h-11" })} href="/portal/ai-agents/assistant">{canEdit ? c.configure : c.view}</Link>
    </CardContent>
  </Card>;
}
