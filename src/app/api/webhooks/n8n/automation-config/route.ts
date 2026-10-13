import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isTimestampFresh, verifyWebhookSignature } from "@/lib/webhook-validator";
import { isOrgActive } from "@/lib/org-guards";
import { buildAutomationEnvelope, findAutomationForDelivery } from "@/lib/automation/config-delivery";

// Configuración de una automatización para n8n (contrato en docs/automations/N8N.md): lo usan los flujos que empiezan en
// un canal (p. ej. un WhatsApp entrante), donde no hay un evento de Reymen que traiga la configuración dentro.
// Firma de plataforma (N8N_WEBHOOK_SECRET) sobre "<timestamp>.<cuerpo>", igual que el callback de ejecuciones.
// Cuerpo: { organizationId, automationId } o { organizationId, templateId }. Siempre se valida la organización.

export async function POST(req: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const rateLimit = await checkRateLimit("webhook:n8n-automation-config", { limit: 600, windowMs: 60_000 });
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
  const organizationId = typeof body.organizationId === "string" ? body.organizationId : "";
  const automationId = typeof body.automationId === "string" ? body.automationId : undefined;
  const templateId = typeof body.templateId === "string" ? body.templateId : undefined;
  if (!organizationId || (!automationId && !templateId)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  if (!(await isOrgActive(organizationId))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const automation = await findAutomationForDelivery({ organizationId, automationId, templateId });
  if (!automation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(await buildAutomationEnvelope(automation));
}
