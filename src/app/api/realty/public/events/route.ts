import { NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { PUBLIC_EVENT_TYPES, recordPublicEvent } from "@/lib/realty/public";

// Eventos de la landing pública /p/<slug> (sin sesión). Llega por
// navigator.sendBeacon, así que siempre responde 204 rápido; los errores no
// se le muestran al visitante. Límite por IP para que no se infle el conteo.

const schema = z.object({
  slug: z.string().min(1).max(80),
  event: z.enum(["property_view", "whatsapp_click", "schedule_click", "share_click"]),
  src: z.string().max(80).nullish(),
  campaign: z.string().max(40).nullish(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const ip = clientIp(request);
  const rl = await checkRateLimit(`realty-event:${ip ?? "unknown"}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) return new NextResponse(null, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds ?? 60) } });
  await recordPublicEvent({
    slug: parsed.data.slug,
    type: PUBLIC_EVENT_TYPES[parsed.data.event],
    source: parsed.data.src ?? null,
    campaignId: parsed.data.campaign ?? null,
    ip,
    userAgent: request.headers.get("user-agent"),
  });
  return new NextResponse(null, { status: 204 });
}
