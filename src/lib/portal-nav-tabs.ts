import { aiCenterUiEnabled } from "./ai/agents/center-ui";
import { aiCenterCopy } from "./ai/agents/center-copy";
import type { Lang } from "./i18n";
import { can } from "./permissions";
import type { Strings } from "./i18n";
import type { UserRole } from "@prisma/client";
import type { PortalTab } from "@/components/portal/PortalSectionTabs";

// Shared tab lists for the module-family groups collapsed in PortalSidebar
// (AI_WHATSAPP and AUTOMATIONS each used to list every sub-page as its own
// sidebar entry — now the sidebar links to the hub page and these tabs
// handle navigation between siblings). Kept in one place so the two module
// families' page headers stay consistent instead of re-deriving the list
// on each page.

export function getAiWhatsappTabs(t: Strings, role: UserRole, lang: Lang = "es"): PortalTab[] {
  if (aiCenterUiEnabled()) {
    const c = aiCenterCopy(lang);
    const tabs: PortalTab[] = [
      { href: "/portal/whatsapp", label: c.overview },
      { href: "/portal/ai-agents", label: c.agents, matchChildren: true },
      { href: "/portal/ai-channels", label: c.channels },
      { href: "/portal/knowledge-base", label: c.knowledge },
    ];
    if (can(role, "knowledge_base:manage")) tabs.push({ href: "/portal/ai-lab", label: c.test });
    if (can(role, "settings:view")) tabs.push({ href: "/portal/ai-usage", label: c.usage });
    return tabs;
  }
  const tabs: PortalTab[] = [
    { href: "/portal/whatsapp", label: t.whatsapp },
    { href: "/portal/knowledge-base", label: t.knowledgeBase },
  ];
  // El probador gasta una llamada a Claude y es de quien configura el agente.
  if (can(role, "knowledge_base:manage")) {
    tabs.push({ href: "/portal/ai-lab", label: t.aiLab });
  }
  // El consumo es información de la cuenta: solo quien ve la configuración.
  if (can(role, "settings:view")) {
    tabs.push({ href: "/portal/ai-usage", label: t.aiUsage });
  }
  return tabs;
}

export function getAutomationsTabs(t: Strings): PortalTab[] {
  return [
    { href: "/portal/automations", label: t.automations },
    { href: "/portal/templates", label: t.templates },
  ];
}
