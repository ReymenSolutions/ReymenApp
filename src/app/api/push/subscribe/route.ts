import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { pushConfigured, pushPublicKey } from "@/lib/push";

// Alta y baja del dispositivo (navegador) del usuario para recibir notificaciones push.
const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "El servicio push debe ser https"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Llave pública VAPID (no es secreta): el navegador la necesita para suscribirse. Null = push sin configurar. */
export async function GET() {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ publicKey: pushConfigured() ? pushPublicKey() : null });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = await checkRateLimit(`push-subscribe:${session.user.id}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = subscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  // Un mismo navegador pasa al usuario que inició sesión ahora (nunca recibe avisos de otra cuenta).
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: session.user.id, userAgent },
    update: { p256dh: keys.p256dh, auth: keys.auth, userId: session.user.id, userAgent, failures: 0 },
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: session.user.id } });
  return NextResponse.json({ success: true });
}
