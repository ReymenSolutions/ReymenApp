import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isWebhookAuthorized } from "@/lib/webhook-validator";
import { isOrgActive } from "@/lib/org-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { processAutomationEvent } from "@/lib/webhook-processors";
import { ingestWebhookEvent } from "@/lib/webhook-ingest";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-reymen-signature") ?? "";
  const timestamp = req.headers.get("x-reymen-timestamp") ?? "";
  const plainSecret = req.headers.get("x-reymen-secret") ?? "";
  const externalEventId = req.headers.get("x-reymen-event-id") || null;

  const rawBody = await req.text();

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const automationId = (parsedBody as { automationId?: string }).automationId;
  if (!automationId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit on the claimed automationId before authenticating, so
  // brute-forcing a webhookSecret for a known automation gets throttled
  // the same as legitimate high-volume traffic would.
  const rateLimit = await checkRateLimit(`webhook:automations:${automationId}`, { limit: 60, windowMs: 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }

  const automation = await prisma.automation.findUnique({ where: { id: automationId } });

  // Authenticate against this specific automation's own webhook secret,
  // matching what the admin panel's Webhook Info dialog documents to n8n.
  if (!automation || !isWebhookAuthorized(rawBody, signature, plainSecret, automation.webhookSecret, timestamp)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = automation.organizationId;
  if (!(await isOrgActive(orgId))) return NextResponse.json({ error: "Organization suspended" }, { status: 403 });

  const result = await ingestWebhookEvent(
    { organizationId: orgId, source: "n8n", eventType: "automation.event", payload: parsedBody, externalEventId },
    () => processAutomationEvent(parsedBody, orgId)
  );

  if (result.outcome === "duplicate") return NextResponse.json({ success: true, duplicate: true });
  if (result.outcome === "failed") return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}
