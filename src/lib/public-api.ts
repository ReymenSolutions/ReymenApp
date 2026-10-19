import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

// ─── API pública para el sitio de Reymen (reymen.mx) ─────────────────────────────────────────────────────────────
// El sitio es estático: no puede guardar secretos, así que estos endpoints no usan firma. Se protegen con: origen
// permitido (CORS), límite de intentos por IP, campo trampa y tamaños acotados. Toda la información entra a la organización
// propia de Reymen (WEB_LEADS_ORG_SLUG), como si Reymen fuera cliente de su propia plataforma.

const DEFAULT_ORIGINS = ["https://reymen.mx", "https://www.reymen.mx"];

export function allowedOrigins(): string[] {
  const extra = (process.env.WEB_ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  const dev = process.env.NODE_ENV === "production" ? [] : ["http://localhost:4321", "http://localhost:3000", "http://127.0.0.1:4321"];
  return [...new Set([...DEFAULT_ORIGINS, ...extra, ...dev])];
}

/** El origen del navegador, si está permitido (null = no permitido o sin origen). */
export function allowedOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin")?.replace(/\/$/, "") ?? null;
  return origin && allowedOrigins().includes(origin) ? origin : null;
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return origin
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600", Vary: "Origin" }
    : { Vary: "Origin" };
}

export function jsonWithCors(req: NextRequest, body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { ...corsHeaders(allowedOrigin(req)), ...(init.headers ?? {}) } });
}

/** Respuesta a la petición previa (preflight) del navegador. */
export function preflight(req: NextRequest) {
  const origin = allowedOrigin(req);
  return new NextResponse(null, { status: origin ? 204 : 403, headers: corsHeaders(origin) });
}

/** Rechaza (403) las peticiones del navegador desde un origen no permitido. Sin cabecera Origin (curl, servidores) se deja pasar: los límites de intentos siguen aplicando. */
export function originRejected(req: NextRequest): NextResponse | null {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigin(req)) return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  return null;
}

/** Límite por IP; devuelve la respuesta 429 si se pasó, o null. */
export async function ipLimited(req: NextRequest, bucket: string, limit: number, windowMs: number): Promise<NextResponse | null> {
  const ip = clientIp(req) ?? "unknown";
  const r = await checkRateLimit(`public:${bucket}:${ip}`, { limit, windowMs });
  if (r.allowed) return null;
  return jsonWithCors(req, { error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds ?? 60) } });
}

/** La organización de Reymen que recibe lo del sitio (por defecto el slug `reymen-solutions`). */
export async function webOrg() {
  const slug = process.env.WEB_LEADS_ORG_SLUG || "reymen-solutions";
  return prisma.organization.findFirst({ where: { slug, isActive: true }, select: { id: true, name: true } });
}

/** Teléfono de WhatsApp: acepta formatos comunes; 10 dígitos se toman como México (+52). Null si no parece un teléfono. */
export function normalizeWhatsapp(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  const only = digits.replace(/\D/g, "");
  if (only.length === 10) return `+52${only}`;
  if (only.length >= 11 && only.length <= 15) return `+${only}`;
  return null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
