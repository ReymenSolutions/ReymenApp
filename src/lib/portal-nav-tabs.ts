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

export function getAiWhatsappTabs(t: Strings, role: UserRole): PortalTab[] {
  const tabs: PortalTab[] = [
    { href: "/portal/whatsapp", label: t.whatsapp },
    { href: "/portal/knowledge-base", label: t.knowledgeBase },
  ];
  // El probador gasta una llamada a Claude y es de quien configura el agente.
  if (can(role, "knowledge_base:manage")) {
    tabs.push({ href: "/portal/ai-lab", label: t.aiLab });
  }
  return tabs;
}

export function getAutomationsTabs(t: Strings): PortalTab[] {
  return [
    { href: "/portal/automations", label: t.automations },
    { href: "/portal/templates", label: t.templates },
  ];
}
