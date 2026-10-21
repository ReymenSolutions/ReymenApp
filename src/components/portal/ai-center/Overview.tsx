import Link from "next/link";
import { MessageSquare, UserRound, Bot } from "lucide-react";
import { centerContext } from "@/lib/ai/agents/center-context";
import { aiCenterCopy, channelLabel } from "@/lib/ai/agents/center-copy";
import { getCenterConversations } from "@/lib/ai/agents/center-data";
import { prisma } from "@/lib/prisma";
import { getAgentModes } from "@/lib/agent-mode";
import { can } from "@/lib/permissions";
import { AiCenterFrame } from "./Frame";
import { AssistantCard } from "./AssistantCard";
import { MetricGrid } from "@/components/shared/MetricGrid";
import { MetricCard } from "@/components/shared/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";
export async function AiCenterOverview() {
  const { session, organizationId, lang } = await centerContext(); const c = aiCenterCopy(lang);
  const canEdit = can(session.user.role, "knowledge_base:manage"), canRead = can(session.user.role, "conversations:view");
  const [assistant, modes, conversations] = await Promise.all([
    prisma.whatsAppAssistant.findUnique({ where: { organizationId }, select: { name: true } }), getAgentModes(organizationId),
    canRead ? getCenterConversations(organizationId) : null,
  ]);
  return <AiCenterFrame lang={lang} role={session.user.role} actions={canEdit ? <Link href="/portal/ai-lab" className={buttonVariants({ className: "min-h-11" })}>{c.test}</Link> : undefined}>
    <p className="rounded-card border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900">{c.distinction}</p>
    {conversations && <section aria-label={c.overview} className="space-y-3"><p className="text-xs text-slate-500">{c.period}</p><MetricGrid columns={2}>
      <MetricCard title={c.total} value={conversations.total} icon={MessageSquare} />
      <MetricCard title={c.open} value={conversations.open} icon={Bot} />
      <MetricCard title={c.human} value={conversations.human} icon={UserRound} />
    </MetricGrid></section>}
    <div className="grid min-w-0 gap-4 xl:grid-cols-2"><AssistantCard lang={lang} name={assistant?.name ?? c.assistant} modes={modes} canEdit={canEdit} />
      <Card><CardHeader><CardTitle>{c.recent}</CardTitle></CardHeader><CardContent className="space-y-4">
        {!conversations ? <p className="text-sm text-slate-600">{c.noPermission}</p> : conversations.recent.length === 0 ? <div className="space-y-2"><p className="font-medium text-slate-900">{c.noConversations}</p><p className="text-sm text-slate-600">{c.start}</p><Link href="/portal/ai-channels" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>{c.channels}</Link></div> : <ul className="divide-y divide-slate-100">{conversations.recent.map(row => <li key={row.id}><Link href={`/portal/conversations/${row.id}`} className="block min-h-11 rounded-md py-3 focus-visible:ring-2 focus-visible:ring-brand-500"><span className="block text-sm font-medium text-slate-900">{row.contactName ?? (lang === "es" ? "Cliente" : "Customer")}</span><span className="text-xs text-slate-500">{channelLabel(row.channel, lang)} · {formatDateTime(row.lastMessageAt, lang)}</span></Link></li>)}</ul>}
        {canRead && <Link href="/portal/conversations" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>{c.allActivity}</Link>}
      </CardContent></Card>
    </div>
  </AiCenterFrame>;
}
