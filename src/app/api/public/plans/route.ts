import { NextRequest, NextResponse } from "next/server";
import { getPlans, planDescription, planName } from "@/lib/plans";
import { corsHeaders, allowedOrigin, originRejected, preflight } from "@/lib/public-api";

export const OPTIONS = preflight;

/**
 * Catálogo de planes para el sitio (solo lectura). APAGADO por defecto: el sitio no muestra precios todavía. Se enciende con
 * PUBLIC_PLANS_ENABLED=true; entonces el sitio siempre muestra lo que hay en Admin → Planes.
 */
export async function GET(req: NextRequest) {
  if (process.env.PUBLIC_PLANS_ENABLED !== "true") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rejected = originRejected(req);
  if (rejected) return rejected;
  const lang = req.nextUrl.searchParams.get("lang") === "en" ? "en" : "es";
  const plans = (await getPlans()).map((p) => ({
    key: p.key,
    name: planName(p, lang),
    description: planDescription(p, lang),
    priceMxn: p.priceMxn,
    limits: p.limits,
    maxAiAgents: p.maxAiAgents,
    features: p.features.map((f) => (lang === "en" ? f.en : f.es)),
    accent: p.accent,
  }));
  return NextResponse.json({ plans, currency: "MXN" }, { headers: { ...corsHeaders(allowedOrigin(req)), "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
