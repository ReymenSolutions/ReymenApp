import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { runAutomationTick } from "@/lib/automation-tick";

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Reloj de las automatizaciones: el cron del VPS lo llama cada 5 minutos. Protegido con CRON_SECRET
 * (falla cerrado, igual que /api/cron/retry-webhooks).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 401 });

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!provided || !secretsMatch(provided, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await runAutomationTick();
  return NextResponse.json({ success: true, ...result });
}
