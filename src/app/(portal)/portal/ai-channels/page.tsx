import { channelConnectionsEnabled } from "@/lib/channel-connections/service";
import { listChannelConnections } from "@/actions/channel-connections";
import { Connections } from "@/components/portal/ai-center/Connections";
import { centerContext } from "@/lib/ai/agents/center-context";
import { aiCenterCopy } from "@/lib/ai/agents/center-copy";
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
import { privateChatEnabled, readPrivateChatSettings } from "@/lib/ai/pilot/chat";
import { MarkChatModeControl } from "@/components/portal/ai-center/MarkChatModeControl";
import { INBOX_CHANNELS } from "@/lib/channels";
import { Badge } from "@/components/ui/badge";
export default async function ChannelsPage() {
  const { session, organizationId, lang } = await centerContext(); const c = aiCenterCopy(lang), canEdit = can(session.user.role, "knowledge_base:manage");
  const [activity, modes, cap, assistant] = await Promise.all([getCenterChannelActivity(organizationId), getAgentModes(organizationId), getAgentCap(organizationId), canEdit ? prisma.whatsAppAssistant.findUnique({ where: { organizationId } }) : null]);
  const accountsEnabled = channelConnectionsEnabled();
  const accounts = canEdit && accountsEnabled ? await listChannelConnections() : [];
  const agents = canEdit && accountsEnabled ? await prisma.agentInstance.findMany({ where: { organizationId, status: "LEGACY", definitionKey: "legacy-assistant", legacyAssistantId: assistant?.isActive ? assistant.id : "" }, select: { id: true, publicName: true } }) : [];
  const pilotMember = privateChatEnabled() && can(session.user.role, "conversations:view") ? await prisma.user.findFirst({ where: { id: session.user.id, organizationId, isActive: true }, select: { id: true } }) : null;
  const pilot = pilotMember ? await readPrivateChatSettings(organizationId, session.user.id) : null;
  const connectionStatus = (channel: string) => {
    const rows = accounts.filter(account => account.channel === channel);
    if (!rows.length) return c.connection;
    if (rows.every(account => account.effectiveState === "HEALTHY")) return lang === "es" ? "Conexión verificada por el conector" : "Connection verified by connector";
    if (rows.some(account => ["DEGRADED", "STALE"].includes(account.effectiveState))) return lang === "es" ? "Conexión: requiere revisión" : "Connection needs review";
    if (rows.every(account => account.effectiveState === "PAUSED")) return lang === "es" ? "Conexión en pausa" : "Connection paused";
    return c.connection;
  };
  const details = Object.fromEntries(activity.map(row => [row.channel, <div key={row.channel} className="mt-3 space-y-2"><Badge variant="secondary" className="whitespace-normal">{connectionStatus(row.channel)}</Badge><p className="text-sm text-slate-600">{row.receivedAt ? `${c.received}: ${formatDateTime(row.receivedAt, lang)}` : c.noActivity}</p>{row.channel === "enquiry" && <p className="text-sm text-slate-500">{c.enquiryNote}</p>}</div>]));
  const footers = Object.fromEntries(INBOX_CHANNELS.map(channel => [channel, <div key={channel} className="space-y-4">
    {channel === "webchat" && pilot && <div className="border-t border-slate-200 pt-4"><MarkChatModeControl initial={pilot} /></div>}
    {canEdit && accountsEnabled && <details><summary className="min-h-11 cursor-pointer text-sm font-medium">{lang === "es" ? "Administrar conexión" : "Manage connection"}</summary><Connections initial={accounts} agents={agents} channelFilter={channel} embedded /></details>}
    {channel === "whatsapp" && canEdit && <details><summary className="min-h-11 cursor-pointer text-sm font-medium">{c.number}</summary><p className="text-sm text-slate-500">{c.numberNote}</p><AssistantConfigForm assistant={assistant} canEdit numberOnly /></details>}
  </div>]));
  return <AiCenterFrame lang={lang} role={session.user.role} title={c.channels} description={c.channelIntro}>
    <p className="text-sm text-slate-500">{c.connectionNote}</p>
    <AgentModesPanel initial={modes} cap={{ cap: cap.cap, overBy: cap.overBy }} canEdit={canEdit} aiConfigured={isDraftProviderConfigured()} plainLanguage channelDetails={details} channelFooter={footers} secondaryChannels={pilot ? ["webchat"] : []} />
  </AiCenterFrame>;
}
