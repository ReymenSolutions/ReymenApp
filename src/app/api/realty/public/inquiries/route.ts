import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { InquiryError, inquirySchema, submitInquiry } from "@/lib/realty/inquiry";
import { sameSite } from "@/lib/realty/public-guard";

// Formulario «Quiero informes» de la landing /p/<slug> (sin sesión, ver src/proxy.ts). Solo acepta peticiones del propio
// sitio (mismo origen), limita por IP y descarta lo que llena el campo trampa. Contesta códigos, no textos: el
// formulario los traduce. Un tope de plan lleno no es error: la persona sigue a WhatsApp (`saved: false`).

const LIMIT = 6;
const WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  if (!sameSite(request)) return NextResponse.json({ error: "origin" }, { status: 403 });
  const ip = clientIp(request);
  const rl = await checkRateLimit(`realty-inquiry:${ip ?? "unknown"}`, { limit: LIMIT, windowMs: WINDOW_MS });
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = inquirySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid", fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")))] }, { status: 400 });
  // Bot: parece éxito y no se guarda nada.
  if (parsed.data.website) return NextResponse.json({ success: true, saved: true });

  try {
    const result = await submitInquiry(parsed.data, { ip, userAgent: request.headers.get("user-agent") });
    return NextResponse.json({ success: true, saved: result.saved });
  } catch (err) {
    if (err instanceof InquiryError) return NextResponse.json({ error: err.code }, { status: err.code === "unavailable" ? 404 : 422 });
    if (err instanceof ZodError) return NextResponse.json({ error: "invalid" }, { status: 400 });
    console.error("[realty/inquiry]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export const GET = () => NextResponse.json({ error: "Method not allowed" }, { status: 405 });
