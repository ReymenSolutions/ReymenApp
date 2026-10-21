import { scheduleAutoReply } from "@/lib/ai-auto-reply";
import { schedulePipelineAgent } from "@/lib/ai-pipeline";
import { getChannelMode } from "@/lib/agent-mode";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTimestampFresh, verifyWebhookSignature } from "@/lib/webhook-validator";
import { checkRateLimit } from "@/lib/rate-limit";
import { ingestWebhookEvent } from "@/lib/webhook-ingest";
import { channelConnectionsEnabled } from "@/lib/channel-connections/service";
import { channelEventSchema, processChannelEvent } from "@/lib/channel-connections/events";

async function limitedBody(req: NextRequest) {
  const reader = req.body?.getReader(); if (!reader) return "";
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); return null; } chunks.push(value); } }
  finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
/** Versioned trusted connector boundary. Requires HMAC even outside production; no raw-secret fallback. */
export async function POST(req: NextRequest) {
  if (!channelConnectionsEnabled()) return NextResponse.json({ error: "Channel connections paused" }, { status: 503 });
  const organizationId = req.headers.get("x-reymen-orgid") ?? "", timestamp = req.headers.get("x-reymen-timestamp") ?? "";
  const org = organizationId ? await prisma.organization.findUnique({ where: { id: organizationId }, select: { isActive: true, n8nWebhookSecret: true } }) : null;
  const raw = await limitedBody(req);
  if (raw === null) return NextResponse.json({ error: "Body too large" }, { status: 413 });
  if (!org?.n8nWebhookSecret || !isTimestampFresh(timestamp) || !verifyWebhookSignature(raw, req.headers.get("x-reymen-signature") ?? "", org.n8nWebhookSecret, timestamp)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!org.isActive || !await prisma.organizationModule.findFirst({ where: { organizationId, module: { in: ["CRM", "AI_WHATSAPP"] }, status: "ACTIVE" }, select: { id: true } })) return NextResponse.json({ error: "Organization or module inactive" }, { status: 403 });
  const limit = await checkRateLimit(`webhook:channel-v1:${organizationId}`, { limit: 120, windowMs: 60000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  let json: unknown; try { json = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = channelEventSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid channel event" }, { status: 400 });
  const event = parsed.data;
  const connection = await prisma.channelConnection.findFirst({ where: { id: event.connectionId, organizationId, externalAccountKey: event.externalAccountKey } });
  if (!connection || (event.type !== "status" && connection.generation !== event.generation)) return NextResponse.json({ error: "Invalid account or generation" }, { status: 400 });
  const result = await ingestWebhookEvent({ organizationId, source: `channel-v1:${connection.id}`, eventType: "channel.v1", externalEventId: `${event.type}:${event.eventId}`, replayKey: req.headers.get("x-reymen-signature"), payload: event }, () => processChannelEvent(event, organizationId));
  if (result.outcome === "failed") return NextResponse.json({ error: "Channel event pending recovery" }, { status: 503 });
  if (result.outcome === "processed" && "conversationId" in result.result) {
    const mode = await getChannelMode(organizationId, connection.channel);
    if (mode === "AUTO") scheduleAutoReply(organizationId, result.result.conversationId);
    if (mode !== "OFF") schedulePipelineAgent(organizationId, result.result.conversationId);
  }
  return NextResponse.json({ success: true, ...(result.outcome === "duplicate" ? { duplicate: true } : result.result) });
}
