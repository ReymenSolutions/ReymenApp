import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasModule } from "@/lib/modules";
import { ingestWebhookEvent } from "@/lib/webhook-ingest";
import { isTimestampFresh, verifyWebhookSignature } from "@/lib/webhook-validator";
import { isOrgActive } from "@/lib/org-guards";
import { getOrgIdForSmartcardCompany } from "@/lib/smartcard-company";
import { processLeadEvent } from "@/lib/webhook-processors";

// Contacto que alguien deja en una SmartCard (formulario "déjanos tus datos") → lead del CRM de ese negocio.
//
// A diferencia de /api/webhooks/n8n/*, que se firma con el secreto de CADA organización, SmartCard es
// otra plataforma con su propio servidor: se firma con un secreto compartido de plataforma
// (SMARTCARD_WEBHOOK_SECRET) y la organización se resuelve por la company de SmartCard
// (companies.external_org_id). Contrato en docs/smartcard/CRM-LEADS.md.
//
// Headers: x-smartcard-timestamp (ms), x-smartcard-signature (sha256=HMAC de "<timestamp>.<cuerpo>"),
// x-smartcard-event-id (opcional, idempotencia).
// Cuerpo: { companyId, name, phone?, email?, message?, cardId?, memberName? } (hace falta phone o email).

const MAX_TEXT = 500;
const text = (v: unknown, max = MAX_TEXT) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function POST(req: NextRequest) {
  const secret = process.env.SMARTCARD_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const rawBody = await req.text();
  const timestamp = req.headers.get("x-smartcard-timestamp") ?? "";
  const signature = req.headers.get("x-smartcard-signature") ?? "";
  if (!isTimestampFresh(timestamp) || !verifyWebhookSignature(rawBody, signature, secret, timestamp)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const companyId = text(body.companyId, 100);
  const name = text(body.name, 120);
  const email = text(body.email, 200);
  const phone = text(body.phone, 40);
  if (!companyId || !name || (!email && !phone)) {
    return NextResponse.json({ error: "companyId, name and a phone or email are required" }, { status: 400 });
  }

  const rateLimit = await checkRateLimit(`webhook:smartcard-leads:${companyId}`, { limit: 60, windowMs: 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  const orgId = await getOrgIdForSmartcardCompany(companyId);
  if (!orgId) return NextResponse.json({ error: "Unknown company" }, { status: 404 });
  if (!(await isOrgActive(orgId))) return NextResponse.json({ error: "Organization suspended" }, { status: 403 });
  // Sin CRM contratado no se guarda nada (el emisor puede reintentar cuando lo tengan).
  if (!(await hasModule(orgId, "CRM"))) return NextResponse.json({ error: "CRM not enabled" }, { status: 403 });

  // Lo que se guarda y lo que se procesa: un evento "lead.created" normal, así que el reintento de eventos fallidos lo cubre.
  const lead = {
    name,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    source: "smartcard",
    metadata: { channel: "smartcard", cardId: text(body.cardId, 100) || null, memberName: text(body.memberName, 120) || null, message: text(body.message, 1000) || null },
  };

  const result = await ingestWebhookEvent(
    { organizationId: orgId, source: "smartcard", eventType: "lead.created", payload: lead, externalEventId: req.headers.get("x-smartcard-event-id") || null },
    () => processLeadEvent(lead, orgId)
  );
  if (result.outcome === "duplicate") return NextResponse.json({ success: true, duplicate: true });
  if (result.outcome === "failed") return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  return NextResponse.json({ success: true });
}
