import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isTimestampFresh, verifyWebhookSignature } from "@/lib/webhook-validator";
import { applyExecutionCallback, CALLBACK_STATUSES, type CallbackStatus } from "@/lib/automation/callback";

// Resultado de una acción de automatización que n8n devuelve a Reymen (contrato en docs/automations/N8N.md).
// Firma de plataforma (N8N_WEBHOOK_SECRET) sobre "<timestamp>.<cuerpo>" + token por ejecución en el cuerpo,
// así el workflow genérico no necesita el secreto de cada organización.
// Cuerpo: { executionId, token, status: "sent"|"delivered"|"failed"|"skipped", providerMessageId?, error? }

export async function POST(req: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const rateLimit = await checkRateLimit("webhook:n8n-automation-executions", { limit: 600, windowMs: 60_000 });
  if (!rateLimit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });

  const rawBody = await req.text();
  const timestamp = req.headers.get("x-reymen-timestamp") ?? "";
  const signature = req.headers.get("x-reymen-signature") ?? "";
  if (!isTimestampFresh(timestamp) || !verifyWebhookSignature(rawBody, signature, secret, timestamp)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const executionId = typeof body.executionId === "string" ? body.executionId : "";
  const token = typeof body.token === "string" ? body.token : "";
  const status = body.status as CallbackStatus;
  if (!executionId || !token || !CALLBACK_STATUSES.includes(status)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const outcome = await applyExecutionCallback({
    executionId,
    token,
    status,
    providerMessageId: typeof body.providerMessageId === "string" ? body.providerMessageId.slice(0, 200) : null,
    error: typeof body.error === "string" ? body.error : null,
  });
  if (!outcome.ok) return NextResponse.json({ error: outcome.reason === "invalid_token" ? "Unauthorized" : "Not found" }, { status: outcome.reason === "invalid_token" ? 401 : 404 });
  return NextResponse.json({ success: true, changed: outcome.changed, status: outcome.status });
}
