import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { AgentTester } from "@/components/portal/AgentTester";
import { PortalSectionTabs } from "@/components/portal/PortalSectionTabs";
import { getAiWhatsappTabs } from "@/lib/portal-nav-tabs";
import { isDraftProviderConfigured } from "@/lib/ai-draft";
import { getServerT, getServerLang } from "@/lib/i18n-server";
import type { UserRole } from "@prisma/client";

export default async function AgentTesterPage() {
  const session = await auth();
  if (!session?.user.organizationId) return redirect("/login");
  await requireModule(session.user.organizationId, "AI_WHATSAPP");
  if (!can(session.user.role as UserRole, "knowledge_base:manage")) return redirect("/portal/dashboard");

  const [lang, t] = await Promise.all([getServerLang(), getServerT()]);
  const es = lang === "es";

  return (
    <div>
      <PageHeader
        title={es ? "Probador del Agente IA" : "AI Agent tester"}
        description={es ? "Prueba qué respondería tu agente antes de activarlo en un canal" : "Test what your agent would answer before turning it on for a channel"}
      />
      <PortalSectionTabs tabs={getAiWhatsappTabs(t, session.user.role as UserRole)} />
      <AgentTester
        aiConfigured={isDraftProviderConfigured()}
        notConfiguredText={es ? "Falta la clave de Claude en el servidor (ANTHROPIC_API_KEY): el probador funciona cuando esté configurada." : "The server has no Claude key (ANTHROPIC_API_KEY): the tester works once it is set."}
      />
    </div>
  );
}

export async function generateMetadata() {
  const t = await getServerT();
  return { title: t.aiLab };
}
