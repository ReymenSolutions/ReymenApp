import { centerContext } from "@/lib/ai/agents/center-context";
import { aiCenterCopy } from "@/lib/ai/agents/center-copy";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getAgentModes } from "@/lib/agent-mode";
import { AiCenterFrame } from "@/components/portal/ai-center/Frame";
import { AssistantCard } from "@/components/portal/ai-center/AssistantCard";
export default async function MyAgentsPage() {
  const { session, organizationId, lang } = await centerContext(); const c = aiCenterCopy(lang);
  const [assistant, modes] = await Promise.all([prisma.whatsAppAssistant.findUnique({ where: { organizationId }, select: { name: true } }), getAgentModes(organizationId)]);
  return <AiCenterFrame lang={lang} role={session.user.role} title={c.agents} description={c.distinction}><AssistantCard lang={lang} name={assistant?.name ?? c.assistant} modes={modes} canEdit={can(session.user.role, "knowledge_base:manage")} /></AiCenterFrame>;
}
