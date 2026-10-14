"use server";

// ─── REYMEN Loyalty — inscripción pública (sin sesión) ────────────────
// La ÚNICA escritura que se puede hacer sin iniciar sesión: inscribirse al
// programa de un negocio desde /lealtad/<slug>. No acepta organizationId del
// cliente (se resuelve por el slug), no devuelve datos de nadie más y tiene
// límite de intentos por IP y por número.

import { headers } from "next/headers";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { UserError } from "@/lib/user-error";
import { phoneKey } from "@/lib/phone";
import { enrollMember, type EnrollResult } from "@/lib/loyalty/service";

const enrollSchema = z.object({
  orgSlug: z.string().min(1).max(120),
  name: z.string().max(120),
  whatsapp: z.string().max(40),
  postalCode: z.string().max(10),
  email: z.string().max(160).optional(),
  branch: z.string().max(40).optional(),
  consent: z.boolean(),
});

export async function enrollInLoyaltyProgram(data: z.input<typeof enrollSchema>): Promise<EnrollResult> {
  const parsed = enrollSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa tus datos.");
  const d = parsed.data;

  const h = await headers();
  const ip = clientIp(new Request("http://local", { headers: h })) ?? "unknown";
  const ipLimit = await checkRateLimit(`loyalty-enroll:ip:${ip}`, { limit: 10, windowMs: 10 * 60 * 1000 });
  if (!ipLimit.allowed) throw new UserError("Demasiados intentos. Intenta de nuevo en unos minutos.");
  const key = phoneKey(d.whatsapp);
  if (key) {
    const phoneLimit = await checkRateLimit(`loyalty-enroll:phone:${d.orgSlug}:${key}`, { limit: 5, windowMs: 10 * 60 * 1000 });
    if (!phoneLimit.allowed) throw new UserError("Demasiados intentos. Intenta de nuevo en unos minutos.");
  }

  return enrollMember(d.orgSlug, {
    name: d.name,
    whatsapp: d.whatsapp,
    postalCode: d.postalCode,
    email: d.email || null,
    branchId: d.branch || null,
    consent: d.consent,
  });
}
