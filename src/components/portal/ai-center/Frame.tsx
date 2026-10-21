import type { ReactNode } from "react";
import type { UserRole } from "@prisma/client";
import type { Lang } from "@/lib/i18n";
import { strings } from "@/lib/i18n";
import { getAiWhatsappTabs } from "@/lib/portal-nav-tabs";
import { PortalSectionTabs } from "@/components/portal/PortalSectionTabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { aiCenterCopy } from "@/lib/ai/agents/center-copy";

export function AiCenterFrame({ lang, role, title, description, children, actions }: { lang: Lang; role: UserRole; title?: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  const c = aiCenterCopy(lang);
  return <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]">
    <PageHeader title={title ?? c.title} description={description ?? c.intro} actions={actions} />
    <PortalSectionTabs wrap tabs={getAiWhatsappTabs(strings[lang], role, lang)} label={c.title} />
    {children}
  </div>;
}
