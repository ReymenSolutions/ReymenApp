// Solo servidor. Lo público de Realty: la landing /p/<slug> y sus eventos.
// Nunca expone la dirección exacta (salvo que el negocio lo active), ni
// datos internos (asesor, notas, prospectos). Los eventos no guardan IP ni
// datos personales: solo un hash diario del visitante para no contar dos
// veces la misma vista.

import { createHash } from "node:crypto";
import type { RealtyEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PUBLIC_EVENT_TYPES: Record<string, RealtyEventType> = {
  property_view: "VIEW",
  whatsapp_click: "WHATSAPP_CLICK",
  schedule_click: "SCHEDULE_CLICK",
  share_click: "SHARE_CLICK",
};

/** Origen de la visita (?src=smartcard, qr, meta…): minúsculas, letras, números, guion y guion bajo, máx. 40. */
export function cleanSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 40);
  return s || null;
}

/** Visible públicamente: publicada y no inactiva (vendida/rentada se muestran como tal). */
const PUBLIC_WHERE = { publishedAt: { not: null }, status: { not: "INACTIVE" as const } };

export async function getPublicProperty(slug: string) {
  const p = await prisma.realtyProperty.findFirst({
    where: { slug, ...PUBLIC_WHERE },
    select: {
      id: true,
      organizationId: true,
      slug: true,
      title: true,
      description: true,
      operation: true,
      propertyType: true,
      status: true,
      price: true,
      currency: true,
      neighborhood: true,
      municipality: true,
      addressLine: true,
      showExactLocation: true,
      latitude: true,
      longitude: true,
      bedrooms: true,
      bathrooms: true,
      parkingSpaces: true,
      constructionArea: true,
      landArea: true,
      ageYears: true,
      furnished: true,
      features: true,
      contactWhatsapp: true,
      advisor: { select: { name: true } },
      zone: { select: { name: true, latitude: true, longitude: true } },
      media: { orderBy: { sortOrder: "asc" }, select: { id: true, width: true, height: true, altText: true } },
      organization: { select: { name: true, logoUrl: true, isActive: true, realtySettings: { select: { publicWhatsapp: true } } } },
    },
  });
  if (!p || !p.organization.isActive) return null;
  const realtyModule = await prisma.organizationModule.findFirst({ where: { organizationId: p.organizationId, module: "REALTY", status: "ACTIVE" }, select: { id: true } });
  if (!realtyModule) return null;
  const { addressLine, latitude, longitude, showExactLocation, advisor, ...rest } = p;
  return {
    ...rest,
    price: Number(p.price),
    // Solo el nombre del asesor (sin correo ni id).
    agentName: advisor?.name ?? null,
    whatsapp: p.contactWhatsapp || p.organization.realtySettings?.publicWhatsapp || null,
    // Ubicación: exacta solo si el negocio lo eligió; si no, el punto aproximado de la zona.
    location: showExactLocation && latitude !== null && longitude !== null ? { exact: true, lat: latitude, lng: longitude, address: addressLine } : { exact: false, lat: p.zone.latitude, lng: p.zone.longitude, address: null },
  };
}

export type PublicProperty = NonNullable<Awaited<ReturnType<typeof getPublicProperty>>>;

export function visitorHash(propertyId: string, ip: string | null, userAgent: string | null, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const salt = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "reymen-realty";
  return createHash("sha256").update(`${salt}|${day}|${propertyId}|${ip ?? "-"}|${userAgent ?? "-"}`).digest("hex").slice(0, 32);
}

/**
 * Registra un evento de la landing. Una vista por visitante y día; los
 * clics se cuentan todos (la ruta ya limita la frecuencia por IP). La
 * campaña solo se acepta si es de la misma organización.
 */
export async function recordPublicEvent(input: { slug: string; type: RealtyEventType; source: string | null; campaignId: string | null; ip: string | null; userAgent: string | null; now?: Date }) {
  const now = input.now ?? new Date();
  const p = await prisma.realtyProperty.findFirst({ where: { slug: input.slug, ...PUBLIC_WHERE }, select: { id: true, organizationId: true } });
  if (!p) return { recorded: false as const, reason: "not_found" as const };
  const hash = visitorHash(p.id, input.ip, input.userAgent, now);
  if (input.type === "VIEW") {
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const seen = await prisma.realtyPropertyEvent.findFirst({ where: { propertyId: p.id, type: "VIEW", visitorHash: hash, occurredAt: { gte: dayStart } }, select: { id: true } });
    if (seen) return { recorded: false as const, reason: "duplicate" as const };
  }
  let campaignId: string | null = null;
  if (input.campaignId) {
    const c = await prisma.realtyCampaign.findFirst({ where: { id: input.campaignId, organizationId: p.organizationId }, select: { id: true } });
    campaignId = c?.id ?? null;
  }
  await prisma.realtyPropertyEvent.create({ data: { organizationId: p.organizationId, propertyId: p.id, type: input.type, source: cleanSource(input.source), campaignId, visitorHash: hash, occurredAt: now } });
  return { recorded: true as const };
}
