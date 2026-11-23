"use server";

// Apartar una prenda desde la web pública (sin sesión). No acepta organizationId ni itemId del navegador: los resuelve
// por el slug de la tienda y el código de la prenda publicada. Límite de intentos por IP y por teléfono.
import { headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { phoneKey } from "@/lib/phone";
import { getOrgTimezone } from "@/lib/business-day";
import { holdMessage, whatsappUrl } from "./catalog";
import { getStorefront, requestHold } from "./source";
import type { HoldResult } from "./types";

const schema = z.object({
  slug: z.string().min(1).max(120),
  code: z.string().min(1).max(80),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30),
});

export async function holdItemFromWeb(data: z.input<typeof schema>): Promise<HoldResult> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  const d = parsed.data;
  const key = phoneKey(d.phone);
  if (!key || key.length < 10) return { ok: false, reason: "INVALID" };

  const h = await headers();
  const ip = clientIp(new Request("http://local", { headers: h })) ?? "unknown";
  const byIp = await checkRateLimit(`retail-hold:ip:${ip}`, { limit: 10, windowMs: 10 * 60_000 });
  const byPhone = await checkRateLimit(`retail-hold:phone:${d.slug}:${key}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!byIp.allowed || !byPhone.allowed) return { ok: false, reason: "RATE_LIMITED" };

  const shop = await getStorefront(d.slug);
  if (!shop) return { ok: false, reason: "NOT_READY" };
  const item = shop.items.find((i) => i.code === d.code);
  if (!item) return { ok: false, reason: "NOT_AVAILABLE" };

  const result = await requestHold({ organizationId: shop.organizationId, itemId: item.id, customer: { name: d.name, phone: d.phone } });
  if (!result.ok) return result;

  const store = shop.stores.find((s) => s.id === item.storeId);
  const timeZone = await getOrgTimezone(shop.organizationId);
  const text = holdMessage({ item, customerName: d.name, expiresAt: result.expiresAt, timeZone });
  return { ...result, whatsappUrl: whatsappUrl(store?.whatsappPhone, text) };
}
