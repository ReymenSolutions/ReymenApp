import { centerContext } from "@/lib/ai/agents/center-context";
import { aiCenterCopy } from "@/lib/ai/agents/center-copy";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { getAgentModes } from "@/lib/agent-mode";
import { AiCenterFrame } from "@/components/portal/ai-center/Frame";
import { AssistantCard } from "@/components/portal/ai-center/AssistantCard";
import { AGENT_IDENTITIES } from "@/lib/ai/agents/identities";
export default async function MyAgentsPage() {
  const { session, organizationId, lang } = await centerContext(); const c = aiCenterCopy(lang);
  const [assistant, modes] = await Promise.all([prisma.whatsAppAssistant.findUnique({ where: { organizationId }, select: { name: true } }), getAgentModes(organizationId)]);
  return <AiCenterFrame lang={lang} role={session.user.role} title={c.agents} description={c.distinction}>
    <AssistantCard lang={lang} name={assistant?.name ?? c.assistant} modes={modes} canEdit={can(session.user.role, "knowledge_base:manage")} />
    <section className="mt-6 min-w-0 space-y-3" aria-label={lang === "es" ? "Nombres y especialidades" : "Names and specialties"}>
      <h2 className="text-lg font-semibold">{lang === "es" ? "Nombres y especialidades" : "Names and specialties"}</h2>
      <p className="text-sm text-slate-600">{lang === "es" ? "Estos nombres identifican cada especialidad. Su aparición aquí no activa un asistente ni lo conecta a un canal." : "These names identify each specialty. Listing them here does not activate an assistant or connect it to a channel."}</p>
      <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 [&>div:last-child:nth-child(odd)]:sm:col-span-2">
        {AGENT_IDENTITIES.map(agent => <div key={agent.name} className="min-w-0 rounded-xl border border-slate-200 p-4"><dt className="font-semibold">{agent.name}</dt><dd className="break-words text-sm text-slate-600">{lang === "es" ? agent.specialty : agent.specialtyEn}</dd></div>)}
      </dl>
    </section>
  </AiCenterFrame>;
}
