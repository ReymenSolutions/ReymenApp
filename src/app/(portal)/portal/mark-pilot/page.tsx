import { notFound } from "next/navigation";
import { requireAiManager } from "@/lib/guards";
import { privateReviewEnabled } from "@/lib/ai/pilot/review";
import { MarkPrivateReview } from "@/components/portal/ai-center/MarkPrivateReview";
import { PageHeader } from "@/components/shared/PageHeader";
export default async function MarkPrivatePilotPage() {
  if (!privateReviewEnabled()) notFound();
  await requireAiManager();
  return <div className="min-w-0 space-y-5"><PageHeader title="Mark · revisión privada con Anthropic" description="Prueba con información ficticia y sin entrega de mensajes." /><MarkPrivateReview /></div>;
}
