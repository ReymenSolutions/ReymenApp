import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runBillingNotices } from "@/lib/billing-notices";

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Avisos de vencimiento de la suscripción. Pensado para correrse una vez al día (cron del VPS o GitHub Action).
 * Protegido con CRON_SECRET: sin él responde 401 en lugar de quedar abierto.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 401 });
  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!provided || !secretsMatch(provided, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, ...(await runBillingNotices()) });
}
