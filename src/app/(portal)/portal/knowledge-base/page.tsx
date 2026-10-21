import { aiCenterUiEnabled } from "@/lib/ai/agents/center-ui";
import LegacyKnowledge from "@/components/portal/ai-center/LegacyKnowledge";
import { CenterKnowledge } from "@/components/portal/ai-center/Knowledge";
export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; page?: string }> }) {
  return aiCenterUiEnabled() ? <CenterKnowledge query={await searchParams} /> : <LegacyKnowledge />;
}
