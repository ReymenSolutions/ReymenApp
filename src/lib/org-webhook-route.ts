import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { isWebhookAuthorized } from "./webhook-validator";
import { checkRateLimit } from "./rate-limit";
import { ingestWebhookEvent } from "./webhook-ingest";

// ─── Webhook entrante firmado con el secreto de la organización ──────
// Todas las rutas de /api/webhooks/n8n/* (salvo /automations, que se firma
// con el secreto de cada automatización) y /api/webhooks/pos/orders hacían
// exactamente lo mismo, copiado en cada archivo: autenticar, limitar,
// parsear el JSON y registrar/procesar el evento una sola vez. Solo cambian
// el tipo de evento, la función que lo procesa y, en dos rutas, la respuesta.

interface OrgWebhookOptions<T> {
  /** Parte variable de la llave de rate limit: `webhook:<rateLimitKey>:<orgId>`. */
  rateLimitKey: string;
  source: "n8n" | "pos" | "delivery";
  eventType: string;
  process: (body: unknown, organizationId: string) => Promise<T>;
  /** Campos extra en la respuesta de éxito (p. ej. el id creado). */
  successBody?: (result: T) => Record<string, unknown>;
  /** Respuesta cuando el procesamiento falla. Por defecto 500 genérico. */
  failureResponse?: (error: string) => NextResponse;
  /**
   * Revisión previa, ya autenticada, ANTES de registrar el evento. Si
   * responde algo, esa es la respuesta y el evento no queda registrado, así
   * que el emisor puede reintentar con el mismo id cuando se resuelva (un
   * evento registrado como fallido se descartaría como duplicado).
   */
  precheck?: (organizationId: string) => Promise<NextResponse | null>;
}

export function createOrgWebhookHandler<T>(options: OrgWebhookOptions<T>) {
  return async function POST(req: NextRequest) {
    const signature = req.headers.get("x-reymen-signature") ?? "";
    const timestamp = req.headers.get("x-reymen-timestamp") ?? "";
    const plainSecret = req.headers.get("x-reymen-secret") ?? "";
    const orgId = req.headers.get("x-reymen-orgid") ?? "";
    const externalEventId = req.headers.get("x-reymen-event-id") || null;

    const rawBody = await req.text();

    // Authenticate against THIS organization's own webhook secret — never a
    // shared secret — so knowing another org's id is never enough to forge
    // requests into it. x-reymen-orgid is just an identifier here, not itself
    // a credential.
    const org = orgId
      ? await prisma.organization.findUnique({ where: { id: orgId }, select: { id: true, isActive: true, n8nWebhookSecret: true } })
      : null;

    if (!org || !isWebhookAuthorized(rawBody, signature, plainSecret, org.n8nWebhookSecret, timestamp)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ya autenticada la firma, una organización suspendida no ingresa eventos (el emisor puede reintentar al reactivarla).
    if (!org.isActive) return NextResponse.json({ error: "Organization suspended" }, { status: 403 });

    const rateLimit = await checkRateLimit(`webhook:${options.rateLimitKey}:${orgId}`, { limit: 120, windowMs: 60 * 1000 });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const rejected = options.precheck ? await options.precheck(orgId) : null;
    if (rejected) return rejected;

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = await ingestWebhookEvent(
      { organizationId: orgId, source: options.source, eventType: options.eventType, payload: parsedBody, externalEventId },
      () => options.process(parsedBody, orgId)
    );

    if (result.outcome === "duplicate") return NextResponse.json({ success: true, duplicate: true });
    if (result.outcome === "failed") {
      return options.failureResponse
        ? options.failureResponse(result.error)
        : NextResponse.json({ error: "Processing failed" }, { status: 500 });
    }
    return NextResponse.json({ success: true, ...(options.successBody?.(result.result) ?? {}) });
  };
}
