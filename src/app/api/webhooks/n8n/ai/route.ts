import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { checkRateLimit } from "@/lib/rate-limit";
import { isTimestampFresh, verifyWebhookSignature } from "@/lib/webhook-validator";
import { generateText } from "@/lib/ai-draft";
import { AiBudgetError } from "@/lib/ai/budget";

// Llamada a IA desde n8n o desde el POS, por el MISMO gateway que usa la app: así comparten el presupuesto del tenant,
// el ledger y el bloqueo por presupuesto. Las llaves del proveedor nunca salen de Reymen (quien llama solo manda el texto).
// Firma de plataforma (N8N_WEBHOOK_SECRET) sobre "<timestamp>.<cuerpo>", igual que el resto de endpoints de n8n.
// Cuerpo: { organizationId, requestId, origin: "n8n"|"pos", agentKey, operation, automationId?, system, messages: [{role, content}], maxOutputTokens? }
// Respuesta (200): { status: "ok", text, model } | { status: "refused" } | { status: "blocked", code, handoff: true }
//   "blocked" = el tenant no tiene presupuesto de IA: el flujo debe seguir SIN IA o pasar a una persona (las funciones sin IA no se afectan).

const MAX_SYSTEM = 20_000;
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 8_000;
const KEY = /^[a-zA-Z0-9:_.-]{1,60}$/;

export async function POST(req: NextRequest) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });

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
  const requestId = typeof body.requestId === "string" && KEY.test(body.requestId) ? body.requestId : "";
  const origin = body.origin === "pos" ? "pos" : body.origin === "n8n" ? "n8n" : "";
  const agentKey = typeof body.agentKey === "string" && KEY.test(body.agentKey) ? body.agentKey : "";
  const operation = typeof body.operation === "string" && KEY.test(body.operation) ? body.operation : "";
  const automationId = typeof body.automationId === "string" ? body.automationId : null;
  const system = typeof body.system === "string" ? body.system : "";
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages = rawMessages.flatMap((m) => {
    const x = m as { role?: unknown; content?: unknown };
    return (x.role === "user" || x.role === "assistant") && typeof x.content === "string" && x.content.trim() ? [{ role: x.role as "user" | "assistant", content: x.content.slice(0, MAX_MESSAGE_CHARS) }] : [];
  });
  if (!organizationId || !requestId || !origin || !agentKey || !operation || !system || system.length > MAX_SYSTEM || messages.length === 0 || messages.length > MAX_MESSAGES || messages[0].role !== "user" || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const maxOutputTokens = Math.min(2048, Math.max(16, Number(body.maxOutputTokens) || 1024));

  const limit = await checkRateLimit(`webhook:n8n-ai:${organizationId}`, { limit: 120, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });

  // Siempre se valida la organización (y la automatización, si viene): una llamada nunca se carga a otro tenant.
  const org = await prisma.organization.findFirst({ where: { id: organizationId, isActive: true }, select: { id: true } });
  if (!org || !(await hasModule(organizationId, "AI_WHATSAPP"))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (automationId && !(await prisma.automation.findFirst({ where: { id: automationId, organizationId }, select: { id: true } }))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await generateText(
      { organizationId, agentKey, operation, origin, automationId, requestId: `${origin}:${requestId}`, correlationId: requestId },
      system,
      messages,
      { maxOutputTokens },
    );
    if ("refused" in result) return NextResponse.json({ status: "refused" });
    return NextResponse.json({ status: "ok", text: result.text, model: result.model });
  } catch (err) {
    if (err instanceof AiBudgetError) return NextResponse.json({ status: "blocked", code: err.code, handoff: true });
    if (err instanceof Error && err.message === "ai_duplicate_request") return NextResponse.json({ error: "Duplicate request" }, { status: 409 });
    return NextResponse.json({ error: "AI provider error" }, { status: 502 });
  }
}
