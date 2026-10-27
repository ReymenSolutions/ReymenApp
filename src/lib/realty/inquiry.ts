// Solo servidor. Formulario «Quiero informes» de la landing pública /p/<slug>: la persona deja WhatsApp, operación,
// tipo, presupuesto y colonia o CP, y eso entra al CRM como Lead + perfil de búsqueda (demanda real para Market Pulse).
// Reutiliza lo que ya existe: el adaptador de Lead (deduplica por teléfono y respeta el tope del plan) y saveProspect
// (zonas, matches, auditoría). Sin sesión: toda organización, propiedad y asesor salen de la propiedad, nunca del cliente.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/user-error";
import { sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/app-url";
import { renderBrandedEmail } from "@/lib/email-template";
import { normalizeWhatsapp } from "@/lib/public-api";
import { OPERATIONS, OPEN_STATUSES, PROPERTY_TYPES, zoneKey } from "./constants";
import { ensureLeadForProspect } from "./lead-adapter";
import { cleanSource, getPublicProperty, recordPublicEvent } from "./public";
import { lookupPostalCode } from "./postal";
import { ensureColoniaZone, saveProspect, type ProspectInput } from "./service";

/** Versión del texto de consentimiento mostrado en el formulario (se guarda con el perfil). */
export const INQUIRY_CONSENT_VERSION = "2026-10";

/** Si un CP tiene más colonias que esto y la organización no tiene zonas en él, se pide la colonia. */
const MAX_COLONIAS_FOR_POSTAL = 3;

export const inquirySchema = z.object({
  slug: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(120),
  /** WhatsApp del interesado. */
  phone: z.string().trim().min(8).max(30),
  operation: z.enum(OPERATIONS as [string, ...string[]]),
  propertyType: z.enum(PROPERTY_TYPES as [string, ...string[]]).nullish(),
  /** «Hasta cuánto»: el máximo que puede pagar. */
  maxBudget: z.coerce.number().positive().max(1_000_000_000),
  /** Colonia (texto) o código postal de 5 dígitos. */
  place: z.string().trim().min(2).max(80),
  consent: z.literal(true),
  /** Campo trampa: las personas no lo ven; los bots sí. */
  website: z.string().max(200).optional(),
  src: z.string().max(80).nullish(),
  campaign: z.string().max(40).nullish(),
});
export type InquiryInput = z.infer<typeof inquirySchema>;

/** Error con código que el formulario traduce a su idioma (la ruta pública no devuelve textos del servidor). */
export type InquiryErrorCode = "phone_invalid" | "unavailable" | "postal_not_found" | "postal_ambiguous" | "place_invalid" | "slot_unavailable" | "date_invalid";
export class InquiryError extends Error {
  constructor(readonly code: InquiryErrorCode) {
    super(code);
  }
}

export type InquiryResult = { saved: true; profileId: string; leadId: string } | { saved: false; reason: "limit" };

/** Zonas de lo que busca: por CP (las que ya tiene la organización, o las colonias del CP si son pocas) o por colonia. */
async function resolveZoneIds(organizationId: string, place: string, prop: { postalCode: string | null; neighborhood: string | null; municipality: string | null }): Promise<string[]> {
  const text = place.trim().replace(/\s+/g, " ");
  if (/^\d{5}$/.test(text)) {
    const existing = await prisma.realtyZone.findMany({ where: { organizationId, postalCode: text }, orderBy: { name: "asc" }, take: 5, select: { id: true } });
    if (existing.length) return existing.map((z) => z.id);
    const info = await lookupPostalCode(text);
    if (!info) throw new InquiryError("postal_not_found");
    if (info.colonias.length > MAX_COLONIAS_FOR_POSTAL) throw new InquiryError("postal_ambiguous");
    const ids: string[] = [];
    for (const c of info.colonias) ids.push((await ensureColoniaZone(organizationId, null, { colonia: c.nombre, postalCode: text, municipality: info.municipio })).id);
    return ids;
  }
  // Si escribió la colonia de la propiedad, se usa su CP: así cae en la misma zona y no se crea otra.
  const sameAsProperty = !!prop.neighborhood && zoneKey(prop.neighborhood) === zoneKey(text);
  const z = await ensureColoniaZone(organizationId, null, { colonia: text, postalCode: sameAsProperty ? prop.postalCode : null, municipality: sameAsProperty ? prop.municipality : null });
  return [z.id];
}

export async function submitInquiry(raw: unknown, ctx: { ip: string | null; userAgent: string | null; now?: Date }): Promise<InquiryResult> {
  const d = inquirySchema.parse(raw);
  const phone = normalizeWhatsapp(d.phone);
  if (!phone) throw new InquiryError("phone_invalid");

  const pub = await getPublicProperty(d.slug);
  if (!pub || !(OPEN_STATUSES as string[]).includes(pub.status)) throw new InquiryError("unavailable");
  const prop = await prisma.realtyProperty.findUnique({
    where: { id: pub.id },
    select: { id: true, organizationId: true, title: true, slug: true, currency: true, advisorUserId: true, branchId: true, postalCode: true, neighborhood: true, municipality: true },
  });
  if (!prop) throw new InquiryError("unavailable");
  const orgId = prop.organizationId;

  const zoneIds = await resolveZoneIds(orgId, d.place, prop).catch((err) => {
    if (err instanceof UserError) throw new InquiryError("place_invalid");
    throw err;
  });

  // El contacto es un Lead del CRM (mismo teléfono = mismo contacto). Si el plan ya no admite más contactos, el
  // formulario no falla: la persona sigue a WhatsApp y el negocio recibe ese mensaje por su canal normal.
  let leadId: string;
  try {
    leadId = (await ensureLeadForProspect(orgId, null, { name: d.name, phone, source: "realty-landing" })).leadId;
  } catch (err) {
    if (err instanceof UserError) return { saved: false, reason: "limit" };
    throw err;
  }
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedTo: true } });
  if (prop.advisorUserId && !lead?.assignedTo) await prisma.lead.update({ where: { id: leadId }, data: { assignedTo: prop.advisorUserId } });

  // Quien vuelve a llenarlo (otra propiedad) actualiza lo que busca en vez de duplicar la demanda; lo que un asesor
  // capturó a mano (recámaras, extras…) se conserva.
  const existing = await prisma.realtyLeadProfile.findFirst({
    where: { organizationId: orgId, leadId, operation: d.operation as ProspectInput["operation"], active: true },
    orderBy: { createdAt: "desc" },
    include: { zones: { orderBy: { priority: "asc" }, select: { zoneId: true } } },
  });
  const maxBudget = Math.round(d.maxBudget);
  const mergedZones = [...new Set([...zoneIds, ...(existing?.zones.map((z) => z.zoneId) ?? [])])].slice(0, 5);
  const src = cleanSource(d.src);
  const input: ProspectInput = {
    id: existing?.id,
    contact: { leadId },
    operation: d.operation as ProspectInput["operation"],
    propertyType: (d.propertyType as ProspectInput["propertyType"] | null | undefined) ?? existing?.propertyType ?? null,
    minBudget: existing?.minBudget !== null && existing?.minBudget !== undefined && Number(existing.minBudget) <= maxBudget ? Number(existing.minBudget) : null,
    maxBudget,
    currency: prop.currency,
    minBedrooms: existing?.minBedrooms ?? null,
    minBathrooms: existing?.minBathrooms ?? null,
    minArea: existing?.minArea ?? null,
    moveTimeline: existing?.moveTimeline ?? null,
    financingNeeded: existing?.financingNeeded ?? null,
    preferences: existing?.preferences ?? [],
    zoneIds: mergedZones,
    branchId: existing?.branchId ?? prop.branchId,
    advisorUserId: existing?.advisorUserId ?? prop.advisorUserId,
    active: true,
    source: existing?.source ?? `landing${src ? `:${src}` : ""}`,
    sourcePropertyId: prop.id,
    consent: { version: INQUIRY_CONSENT_VERSION, at: ctx.now ?? new Date() },
  };
  const profileId = await saveProspect(orgId, null, input);

  await recordPublicEvent({ slug: prop.slug, type: "INQUIRY", source: d.src ?? null, campaignId: d.campaign ?? null, ip: ctx.ip, userAgent: ctx.userAgent, now: ctx.now });
  await notifyTeam({ orgId, advisorUserId: prop.advisorUserId, profileId, propertyTitle: prop.title, name: d.name, phone, operation: d.operation, propertyType: d.propertyType ?? null, maxBudget, currency: prop.currency, place: d.place }).catch(() => undefined);
  return { saved: true, profileId, leadId };
}

/** Aviso por correo al asesor de la propiedad (o, sin asesor, a quien administra el negocio). Un fallo nunca rompe el alta. */
async function notifyTeam(n: { orgId: string; advisorUserId: string | null; profileId: string; propertyTitle: string; name: string; phone: string; operation: string; propertyType: string | null; maxBudget: number; currency: string; place: string }) {
  const advisor = n.advisorUserId ? await prisma.user.findFirst({ where: { id: n.advisorUserId, organizationId: n.orgId, isActive: true }, select: { email: true } }) : null;
  const recipients = advisor ? [advisor.email] : (await prisma.user.findMany({ where: { organizationId: n.orgId, role: { in: ["OWNER", "ADMIN", "MANAGER"] }, isActive: true }, select: { email: true } })).map((u) => u.email);
  if (!recipients.length) return;
  const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: n.currency, maximumFractionDigits: 0 }).format(n.maxBudget);
  const digits = n.phone.replace(/\D/g, "");
  const { html, text } = renderBrandedEmail({
    preheader: `${n.name} · ${n.propertyTitle}`,
    title: "Nuevo interesado en una propiedad",
    intro: `Alguien pidió informes de «${n.propertyTitle}». Escríbele pronto: el primer mensaje es el que más cuenta.`,
    rows: [
      { label: "Nombre", value: n.name },
      { label: "WhatsApp", value: n.phone, href: `tel:${n.phone}` },
      { label: "Busca", value: `${n.operation === "RENT" ? "Rentar" : "Comprar"}${n.propertyType ? ` · ${n.propertyType}` : ""}` },
      { label: "Presupuesto", value: `Hasta ${money}` },
      { label: "Colonia o CP", value: n.place },
    ],
    actions: [
      { label: "Ver prospecto", url: appUrl(`/portal/realty/prospects/${n.profileId}`) },
      { label: "Escribir por WhatsApp", url: `https://wa.me/${digits}`, secondary: true },
    ],
  });
  await Promise.all(recipients.map((to) => sendEmail({ to, subject: `Nuevo interesado: ${n.name}`, html, text }).catch(() => undefined)));
}

