import { aiCenterUiEnabled } from "@/lib/ai/agents/center-ui";
import LegacyAiCenter from "@/components/portal/ai-center/LegacyAiCenter";
import { AiCenterOverview } from "@/components/portal/ai-center/Overview";
export default function WhatsAppCenterPage() {
  return aiCenterUiEnabled() ? <AiCenterOverview /> : <LegacyAiCenter />;
}
