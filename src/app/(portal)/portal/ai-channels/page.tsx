import { channelConnectionsEnabled } from "@/lib/channel-connections/service";
import { listChannelConnections } from "@/actions/channel-connections";
import { Connections } from "@/components/portal/ai-center/Connections";
import { centerContext } from "@/lib/ai/agents/center-context";
import { aiCenterCopy, channelLabel } from "@/lib/ai/agents/center-copy";
import { getCenterChannelActivity } from "@/lib/ai/agents/center-data";
import { getAgentModes } from "@/lib/agent-mode";
import { getAgentCap } from "@/lib/agent-cap";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { isDraftProviderConfigured } from "@/lib/ai-draft";
import { formatDateTime } from "@/lib/utils";
import { AiCenterFrame } from "@/components/portal/ai-center/Frame";
import { AgentModesPanel } from "@/components/portal/AgentModesPanel";
import { AssistantConfigForm } from "@/components/portal/AssistantConfigForm";
import { MetricGrid } from "@/components/shared/MetricGrid";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
export default async function ChannelsPage() {
  const { session, organizationId, lang } = await centerContext(); const c = aiCenterCopy(lang), canEdit = can(session.user.role, "knowledge_base:manage");
  const [activity, modes, cap, assistant] = await Promise.all([getCenterChannelActivity(organizationId), getAgentModes(organizationId), getAgentCap(organizationId), canEdit ? prisma.whatsAppAssistant.findUnique({ where: { organizationId } }) : null]);
  const accountsEnabled = channelConnectionsEnabled();
  const accounts = canEdit && accountsEnabled ? await listChannelConnections() : [];
  const agents = canEdit && accountsEnabled ? await prisma.agentInstance.findMany({ where: { organizationId, status: "LEGACY", definitionKey: "legacy-assistant", legacyAssistantId: assistant?.isActive ? assistant.id : "" }, select: { id: true, publicName: true } }) : [];
  const activityBlock = <>
    <MetricGrid columns={2} density="comfortable">{activity.map(row => <Card key={row.channel}><CardHeader><CardTitle>{channelLabel(row.channel, lang)}</CardTitle></CardHeader><CardContent className="space-y-3"><Badge variant="secondary" className="whitespace-normal">{c.connection}</Badge><p className="text-sm text-slate-600">{row.receivedAt ? `${c.received}: ${formatDateTime(row.receivedAt, lang)}` : c.noActivity}</p>{row.channel === "enquiry" && <p className="text-sm text-slate-500">{c.enquiryNote}</p>}</CardContent></Card>)}</MetricGrid>
    <p className="text-sm text-slate-500">{c.connectionNote}</p>
  </>;
  return <AiCenterFrame lang={lang} role={session.user.role} title={c.channels} description={c.channelIntro}>
    {canEdit && accountsEnabled && <Connections initial={accounts} agents={agents} />}
    {accountsEnabled ? <details><summary className="min-h-11 cursor-pointer text-sm font-semibold text-slate-900">{lang === "es" ? "Actividad histórica por canal (no verifica la conexión)" : "Historical channel activity (does not verify the connection)"}</summary>{activityBlock}</details> : activityBlock}
    <AgentModesPanel initial={modes} cap={{ cap: cap.cap, overBy: cap.overBy }} canEdit={canEdit} aiConfigured={isDraftProviderConfigured()} plainLanguage />
    {canEdit && <Card><CardHeader><CardTitle>{c.number}</CardTitle><p className="text-sm text-slate-500">{c.numberNote}</p></CardHeader><CardContent><AssistantConfigForm assistant={assistant} canEdit numberOnly /></CardContent></Card>}
  </AiCenterFrame>;
}
