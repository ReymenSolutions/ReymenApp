import { NextRequest, NextResponse } from "next/server";
import { getDueFollowUps } from "@/lib/follow-ups";
import { authenticateOrgRequest } from "@/lib/api-key-auth";

// Internal n8n query: GET /api/v1/leads/due-followups?orgId=xxx
// n8n polls this on its own schedule (no cron inside the platform — see
// docs/DOCUMENTACION_TECNICA.md §7) and sends the actual follow-up message
// for each row returned, then reports each send via
// POST /api/webhooks/n8n/followup-sent so attempts are counted correctly
// and a rule never exceeds its own maxAttempts. Secured the same way as
// /api/v1/knowledge-base: X-Api-Key matched against THAT organization's own
// n8nWebhookSecret, or a NextAuth session for browser callers.
export async function GET(req: NextRequest) {
  const authResult = await authenticateOrgRequest(req);
  if (authResult.response) return authResult.response;

  return NextResponse.json({ data: await getDueFollowUps(authResult.orgId) });
}
