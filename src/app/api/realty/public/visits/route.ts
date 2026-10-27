import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { InquiryError } from "@/lib/realty/inquiry";
import { sameSite } from "@/lib/realty/public-guard";
import { requestVisit, visitRequestSchema } from "@/lib/realty/visit-request";

// «Agendar visita» de la landing /p/<slug> (sin sesión): crea la cita en Citas. Mismo origen, límite por IP, campo trampa;
// responde códigos (el formulario los traduce).

export async function POST(request: Request) {
  if (!sameSite(request)) return NextResponse.json({ error: "origin" }, { status: 403 });
  const ip = clientIp(request);
  const rl = await checkRateLimit(`realty-visit:${ip ?? "unknown"}`, { limit: 6, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = visitRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid", fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")))] }, { status: 400 });
  if (parsed.data.website) return NextResponse.json({ success: true, startsAt: parsed.data.startsAt });

  try {
    const r = await requestVisit(parsed.data);
    return NextResponse.json({ success: true, startsAt: r.startsAt, leadSaved: r.leadSaved });
  } catch (err) {
    if (err instanceof InquiryError) return NextResponse.json({ error: err.code }, { status: err.code === "unavailable" ? 404 : err.code === "slot_unavailable" ? 409 : 422 });
    if (err instanceof ZodError) return NextResponse.json({ error: "invalid" }, { status: 400 });
    console.error("[realty/visit]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}

export const GET = () => NextResponse.json({ error: "Method not allowed" }, { status: 405 });
