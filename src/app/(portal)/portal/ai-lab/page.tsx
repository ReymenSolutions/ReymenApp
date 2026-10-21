import { markSandboxEnabled } from "@/lib/ai/mark/contract";
import { MarkSandbox } from "@/components/portal/ai-center/MarkSandbox";
import { aiCenterUiEnabled } from "@/lib/ai/agents/center-ui";
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
      <PortalSectionTabs label={es ? "Secciones de asistentes IA" : "AI assistant sections"} wrap={aiCenterUiEnabled()} tabs={getAiWhatsappTabs(t, session.user.role as UserRole, lang)} />
      <AgentTester
        plainLanguage={aiCenterUiEnabled()}
        aiConfigured={isDraftProviderConfigured()}
        notConfiguredText={aiCenterUiEnabled() ? (es ? "La IA no está disponible por el momento. Puedes preparar tus reglas y volver a intentar más tarde." : "AI is currently unavailable. You can prepare your rules and try again later.") : es ? "Falta la clave de Claude en el servidor (ANTHROPIC_API_KEY): el probador funciona cuando esté configurada." : "The server has no Claude key (ANTHROPIC_API_KEY): the tester works once it is set."}
      />
      {markSandboxEnabled() && <MarkSandbox lang={lang} />}
    </div>
  );
}

export async function generateMetadata() {
  const t = await getServerT();
  return { title: t.aiLab };
}
