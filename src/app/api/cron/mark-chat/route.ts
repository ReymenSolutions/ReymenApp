import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { privateChatEnabled, recoverPrivateChatJobs } from "@/lib/ai/pilot/chat";
export const maxDuration = 180;
export async function POST(req: NextRequest) {
  if (!privateChatEnabled()) return NextResponse.json({ error: "Unavailable" }, { status: 404 });
  const secret = process.env.CRON_SECRET, supplied = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!secret || !supplied || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, ...await recoverPrivateChatJobs() });
}
