import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { InquiryError } from "@/lib/realty/inquiry";
import { getVisitSlots } from "@/lib/realty/visit-request";

// Horarios libres para visitar una propiedad un día dado: GET ?slug=…&date=YYYY-MM-DD → { timezone, slots: [ISO] }.
// Solo lectura; límite por IP para que no se use para recorrer la agenda.

export async function GET(request: Request) {
  const ip = clientIp(request);
  const rl = await checkRateLimit(`realty-slots:${ip ?? "unknown"}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } });
  const url = new URL(request.url);
  const slug = url.searchParams.get("slug") ?? "";
  const date = url.searchParams.get("date") ?? "";
  if (!slug || slug.length > 80) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    return NextResponse.json(await getVisitSlots(slug, date), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof InquiryError) return NextResponse.json({ error: err.code }, { status: err.code === "unavailable" ? 404 : 422 });
    console.error("[realty/visit-slots]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
}
