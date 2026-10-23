import { notFound } from "next/navigation";
import { requireAiManager } from "@/lib/guards";
import { privateChatEnabled } from "@/lib/ai/pilot/chat";
import { PageHeader } from "@/components/shared/PageHeader";
import { MarkChatLauncher } from "@/components/portal/ai-center/MarkChatLauncher";
export default async function MarkChatPilotPage() {
  if (!privateChatEnabled()) notFound(); await requireAiManager();
  return <div className="min-w-0 space-y-5"><PageHeader title="Lía · Website Chat privado" description="Piloto con revisión humana, sin conectar canales productivos." /><MarkChatLauncher /></div>;
}
