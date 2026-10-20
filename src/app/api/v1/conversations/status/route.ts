import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateOrgRequest } from "@/lib/api-key-auth";
import { normalizeChannel } from "@/lib/channels";
import { phoneKey } from "@/lib/phone";

// Internal n8n query: GET /api/v1/conversations/status?orgId=xxx&contactPhone=xxx
// (or &conversationId=xxx). n8n's AI-reply workflow calls this before
// generating an automatic reply — if aiHandled is false, a human has taken
// or been given control and the bot must stay quiet instead of racing a
// manual reply. Secured the same way as /api/v1/knowledge-base: X-Api-Key
// matched against THAT organization's own n8nWebhookSecret, or a NextAuth
// session for browser callers.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const authResult = await authenticateOrgRequest(req);
  if (authResult.response) return authResult.response;
  const orgId = authResult.orgId;

  const conversationId = searchParams.get("conversationId") ?? undefined;
  const contactPhone = searchParams.get("contactPhone") ?? undefined;
  const requestedChannel = searchParams.get("channel");
  const channel = normalizeChannel(requestedChannel);
  const key = phoneKey(contactPhone);

  if (!conversationId && !contactPhone) {
    return NextResponse.json({ error: "conversationId or contactPhone required" }, { status: 400 });
  }

  const conversation = conversationId
    ? await prisma.conversation.findFirst({
        where: { id: conversationId, organizationId: orgId, ...(requestedChannel !== null ? { channel } : {}) },
        select: { id: true, status: true, aiHandled: true, assignedToId: true },
      })
    : await prisma.conversation.findFirst({
        where: { organizationId: orgId, channel, status: { in: ["OPEN", "ESCALATED"] }, ...(key ? { OR: [{ phoneKey: key }, { phoneKey: null, contactPhone }] } : { contactPhone }) },
        orderBy: { updatedAt: "desc" },
        select: { id: true, status: true, aiHandled: true, assignedToId: true },
      });

  if (conversationId && !conversation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  // No open conversation yet for this contact — the bot is free to create
  // one and respond, matching the aiHandled=true default a new Conversation
  // gets when the inbound message webhook first creates it.
  if (!conversation) {
    return NextResponse.json({ data: { conversationId: null, aiHandled: true, status: null, assignedToId: null } });
  }

  return NextResponse.json({
    data: {
      conversationId: conversation.id,
      aiHandled: conversation.aiHandled,
      status: conversation.status,
      assignedToId: conversation.assignedToId,
    },
  });
}
