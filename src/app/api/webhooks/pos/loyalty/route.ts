import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isWebhookAuthorized } from "@/lib/webhook-validator";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasModule } from "@/lib/modules";
import { lookupMemberForPos, parsePosLoyalty } from "@/lib/loyalty/pos";

// Consulta de Lealtad desde la caja de Reymen POS: el cajero escanea el QR de
// la tarjeta del cliente (o escribe su WhatsApp) y el POS pregunta aquí su
// progreso y sus recompensas disponibles ANTES de cobrar. No registra nada:
// la visita se registra cuando llega la orden por /api/webhooks/pos/orders con
// el mismo bloque `loyalty`.
//
// Misma autenticación que las órdenes: firma HMAC del cuerpo crudo con un
// timestamp fresco, contra el secreto PROPIO de la organización. Al ser una
// consulta, no se registra como evento ni se deduplica.
//
// Cuerpo: { "code": "<QR o token>" } o { "phone": "81 5550 0001" }.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-reymen-signature") ?? "";
  const timestamp = req.headers.get("x-reymen-timestamp") ?? "";
  const plainSecret = req.headers.get("x-reymen-secret") ?? "";
  const orgId = req.headers.get("x-reymen-orgid") ?? "";
  const rawBody = await req.text();

  const org = orgId ? await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, n8nWebhookSecret: true } }) : null;
  if (!org || !isWebhookAuthorized(rawBody, signature, plainSecret, org.n8nWebhookSecret, timestamp)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(`webhook:pos-loyalty:${orgId}`, { limit: 240, windowMs: 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  if (!(await hasModule(orgId, "LOYALTY"))) {
    return NextResponse.json({ error: "Lealtad no está activada para este negocio.", code: "loyalty_module_disabled" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await lookupMemberForPos(orgId, parsePosLoyalty(body));
  return NextResponse.json(result, { status: result.status === "invalid_request" ? 400 : 200 });
}
