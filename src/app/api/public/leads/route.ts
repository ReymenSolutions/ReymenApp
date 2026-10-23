import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ingestWebhookEvent } from "@/lib/webhook-ingest";
import { processLeadEvent } from "@/lib/webhook-processors";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/app-url";
import { renderBrandedEmail } from "@/lib/email-template";
import { EMAIL_RE, ipLimited, jsonWithCors, normalizeWhatsapp, originRejected, preflight, webOrg } from "@/lib/public-api";

export const OPTIONS = preflight;

/** Versión del texto de privacidad aceptado (se guarda con el lead). */
const PRIVACY_VERSION = "2026-10";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  /** WhatsApp o correo. */
  contact: z.string().trim().min(5).max(200),
  business: z.string().trim().max(120).optional(),
  vertical: z.string().trim().max(60).optional(),
  message: z.string().trim().max(1000).optional(),
  consent: z.literal(true),
  /** Campo trampa: las personas no lo ven ni lo llenan; los bots sí. */
  website: z.string().max(200).optional(),
  source: z.string().trim().max(60).optional(),
});

/**
 * Formulario del sitio → lead en el CRM de Reymen, con aviso por correo. Siempre contesta lo mismo ante un bot (campo trampa
 * lleno) para no darle pistas.
 */
export async function POST(req: NextRequest) {
  const rejected = originRejected(req);
  if (rejected) return rejected;
  const limited = await ipLimited(req, "leads", 5, 60 * 60 * 1000);
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonWithCors(req, { error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return jsonWithCors(req, { error: "Invalid data", fields: parsed.error.issues.map((i) => String(i.path[0] ?? "")) }, { status: 400 });
  const d = parsed.data;
  if (d.website) return jsonWithCors(req, { success: true }); // bot: parece éxito y no se guarda nada

  const isEmail = EMAIL_RE.test(d.contact);
  const phone = isEmail ? null : normalizeWhatsapp(d.contact);
  if (!isEmail && !phone) return jsonWithCors(req, { error: "Invalid contact", fields: ["contact"] }, { status: 400 });

  const org = await webOrg();
  if (!org) return jsonWithCors(req, { error: "Not configured" }, { status: 503 });

  const payload = {
    name: d.name,
    ...(isEmail ? { email: d.contact.toLowerCase() } : { phone }),
    source: d.source || "web",
    metadata: { channel: "web", business: d.business ?? null, vertical: d.vertical ?? null, message: d.message ?? null, consent: { accepted: true, privacyVersion: PRIVACY_VERSION, at: new Date().toISOString() } },
  };
  const result = await ingestWebhookEvent({ organizationId: org.id, source: "web", eventType: "lead.created", payload, externalEventId: null }, () => processLeadEvent(payload, org.id));
  if (result.outcome === "failed") return jsonWithCors(req, { error: "Could not save" }, { status: 500 });

  // Aviso al equipo (dueños de la organización). Un fallo del correo nunca rompe el alta.
  try {
    const owners = await prisma.user.findMany({ where: { organizationId: org.id, role: { in: ["OWNER", "SUPER_ADMIN", "ADMIN", "MANAGER"] }, isActive: true }, select: { email: true } });
    const waDigits = phone ? phone.replace(/\D/g, "") : null;
    const { html, text } = renderBrandedEmail({
      preheader: `${d.name}${d.business ? ` · ${d.business}` : ""}`,
      title: "Nuevo contacto desde el sitio",
      intro: "Alguien dejó sus datos en reymen.mx. Responde pronto: el primer mensaje es el que más cuenta.",
      rows: [
        { label: "Nombre", value: d.name },
        { label: isEmail ? "Correo" : "WhatsApp", value: d.contact, href: isEmail ? `mailto:${d.contact}` : phone ? `tel:${phone}` : undefined },
        { label: "Negocio", value: d.business ?? "" },
        { label: "Tipo", value: d.vertical ?? "" },
      ],
      note: d.message ? { label: "Mensaje", text: d.message } : undefined,
      actions: [
        { label: "Ver en el CRM", url: appUrl("/portal/leads") },
        ...(waDigits ? [{ label: "Escribir por WhatsApp", url: `https://wa.me/${waDigits}`, secondary: true }] : []),
      ],
    });
    await Promise.all(owners.map((o) => sendEmail({ to: o.email, subject: `Nuevo contacto del sitio: ${d.name}`, html, text }).catch(() => undefined)));
  } catch {
    /* sin aviso, el lead ya quedó */
  }
  return jsonWithCors(req, { success: true });
}

export const GET = () => NextResponse.json({ error: "Method not allowed" }, { status: 405 });
