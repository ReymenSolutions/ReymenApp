import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isWebhookAuthorized } from "@/lib/webhook-validator";
import { checkRateLimit } from "@/lib/rate-limit";
import { reserveAutomationRun, settleAutomationRun } from "@/lib/automation/usage";

const input = z.object({ automationId: z.string().min(1).max(100), executionId: z.string().min(1).max(160), action: z.enum(["reserve", "succeeded", "failed"]) });
/** External workflows call reserve BEFORE work and settle with the same durable run ID. Never call a failed outcome on a timeout. */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let parsed;
  try { parsed = input.safeParse(JSON.parse(raw)); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { automationId, executionId, action } = parsed.data;
  if (!(await checkRateLimit(`automation-admission:${automationId}`, { limit: 120, windowMs: 60_000 })).allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const automation = await prisma.automation.findUnique({ where: { id: automationId } });
  if (!automation || !isWebhookAuthorized(raw, req.headers.get("x-reymen-signature") ?? "", req.headers.get("x-reymen-secret") ?? "", automation.webhookSecret, req.headers.get("x-reymen-timestamp") ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = `external:${automationId}:${executionId}`;
  if (action === "reserve") {
    const result = await reserveAutomationRun(automation.organizationId, automationId, key);
    return NextResponse.json(result, { status: result.allowed ? 200 : 409 });
  }
  const reservation = await prisma.automationUsage.findUnique({ where: { organizationId_executionKey: { organizationId: automation.organizationId, executionKey: key } } });
  if (!reservation) return NextResponse.json({ error: "Reservation required" }, { status: 409 });
  await settleAutomationRun(automation.organizationId, key, action === "succeeded");
  return NextResponse.json({ success: true });
}
