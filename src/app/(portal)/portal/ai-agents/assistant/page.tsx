import Link from "next/link";
import { centerContext } from "@/lib/ai/agents/center-context";
import { aiCenterCopy, executionLabel } from "@/lib/ai/agents/center-copy";
import { getCenterExecutions } from "@/lib/ai/agents/center-data";
import { getLegacyAgentModel } from "@/lib/ai/agents/model";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { AiCenterFrame } from "@/components/portal/ai-center/Frame";
import { AgentNameForm } from "@/components/portal/ai-center/NameForm";
import { ExecutionDetail } from "@/components/portal/ai-center/ExecutionDetail";
import { CenterPagination } from "@/components/portal/ai-center/Pagination";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
export default async function AgentProfilePage({ searchParams }: { searchParams: Promise<{ activityPage?: string }> }) {
  const { session, organizationId, lang } = await centerContext(); const c = aiCenterCopy(lang), canEdit = can(session.user.role, "knowledge_base:manage");
  const query = await searchParams;
  const [assistant, model, history] = await Promise.all([
    prisma.whatsAppAssistant.findUnique({ where: { organizationId }, select: { name: true } }),
    canEdit ? getLegacyAgentModel(organizationId) : null,
    canEdit ? getCenterExecutions(organizationId, query.activityPage) : null,
  ]);
  const version = model?.instance ? { id: model.instance.id, expectedVersion: model.instance.configVersion, expectedHash: model.source.sourceHash } : null;
  return <AiCenterFrame lang={lang} role={session.user.role} title={assistant?.name ?? c.assistant} description={c.existing}>
    <Card><CardHeader><CardTitle>{c.profile}</CardTitle></CardHeader><CardContent>{canEdit ? <AgentNameForm initialName={assistant?.name ?? "Asistente AI"} version={version} /> : <p className="text-sm text-slate-600">{c.readOnly}</p>}</CardContent></Card>
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      <Card><CardHeader><CardTitle>{c.abilities}</CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-sm text-slate-600">{c.abilitiesText}</p><Link href="/portal/knowledge-base" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>{c.knowledge}</Link><Link href="/portal/ai-channels" className={buttonVariants({ variant: "outline", className: "min-h-11 ml-2" })}>{c.channels}</Link></CardContent></Card>
      <Card><CardHeader><CardTitle>{c.help}</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-600">{c.helpText}</p></CardContent></Card>
    </div>
    {canEdit && history && <section aria-label={c.history} className="space-y-4"><h2 className="text-base font-semibold text-slate-900">{c.history}</h2><p className="text-sm text-slate-500">{c.historyHint}</p>
      {history.rows.length === 0 ? <Card><CardContent className="py-6"><p className="mb-3 text-sm text-slate-600">{c.noExecutions}</p><Link href="/portal/conversations" className={buttonVariants({ variant: "outline", className: "min-h-11" })}>{c.allActivity}</Link></CardContent></Card> : <ul className="space-y-2">{history.rows.map(row => <li key={row.id}><Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="text-sm font-medium text-slate-900">{executionLabel(row.status, lang)}</p><p className="text-xs text-slate-500">{row.operation === "ai.pipeline" ? (lang === "es" ? "Análisis del CRM" : "CRM analysis") : (lang === "es" ? "Respuesta al cliente" : "Customer reply")} · {formatDateTime(row.createdAt, lang)}</p></div><ExecutionDetail id={row.id} /></CardContent></Card></li>)}</ul>}
      <CenterPagination page={history.page} pages={history.pages} lang={lang} href={page => `/portal/ai-agents/assistant?activityPage=${page}`} />
    </section>}
  </AiCenterFrame>;
}
