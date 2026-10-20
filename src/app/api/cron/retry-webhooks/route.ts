import { reconcileAgentExecutions } from "@/lib/ai/agents/executions";
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { retryAllFailedWebhookEvents } from "@/lib/webhook-retry";
import { recoverAutoReplies } from "@/lib/ai-auto-reply";
import { recoverPipelineAnalyses } from "@/lib/ai-pipeline";

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Meant to be hit periodically (e.g. a scheduled GitHub Action or an
 * external cron service) to retry webhook events that failed processing.
 * Protected by CRON_SECRET — fails closed (401) if it isn't configured,
 * rather than leaving the endpoint open.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 401 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (!provided || !secretsMatch(provided, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await retryAllFailedWebhookEvents();
  const pipeline = await recoverPipelineAnalyses();
  const ai = await recoverAutoReplies();
  await reconcileAgentExecutions().catch(() => { console.error("[agent-model] reconciliation pending"); });
  return NextResponse.json({ success: true, ...result, ai, pipeline });
}
