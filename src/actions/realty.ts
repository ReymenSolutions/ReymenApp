"use server";

// ─── REYMEN Ops Realty — acciones del panel (con sesión) ──────────────
// Mismo patrón que loyalty.ts: guard (permiso + módulo REALTY) → zod del
// lado del servidor → servicio con el organizationId de la SESIÓN →
// auditoría (en service.ts) → revalidatePath.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRealtyManager, requireRealtyOperator } from "@/lib/guards";
import { UserError } from "@/lib/user-error";
import { FEATURES, OPERATIONS, PROPERTY_STATUSES, PROPERTY_TYPES } from "@/lib/realty/constants";
import {
  addPropertyPhotos,
  changePropertyStatus,
  deleteCampaign,
  deletePropertyPhoto,
  deleteZone,
  recomputeAllMatches,
  recordClosing,
  saveCampaign,
  saveProperty,
  saveProspect,
  saveSettings,
  saveZone,
  scheduleVisit,
  setCoverPhoto,
  updateVisit,
} from "@/lib/realty/service";
import { MAX_UPLOAD_BYTES } from "@/lib/realty/media";
import { geocodeAddress } from "@/lib/realty/geocode";

function revalidateRealty(extra: string[] = []) {
  revalidatePath("/portal/realty", "layout");
  for (const p of extra) revalidatePath(p);
}

const optNum = (max: number) => z.coerce.number().min(0).max(max).nullable().optional().transform((v) => (v === undefined || v === null || Number.isNaN(v) ? null : v));
const optText = (max: number) => z.string().trim().max(max).nullable().optional().transform((v) => (v ? v : null));
const optId = z.string().trim().max(40).nullable().optional().transform((v) => (v ? v : null));
const currency = z.enum(["MXN", "USD"]).default("MXN");
const features = z.array(z.enum(FEATURES)).max(FEATURES.length).default([]);
const coord = (lim: number) => z.coerce.number().min(-lim).max(lim).nullable().optional().transform((v) => (v === undefined || v === null || Number.isNaN(v) ? null : v));

// ─── Propiedades ────────────────────────────────────────────────────────

const propertySchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(3).max(140),
  description: optText(5000),
  operation: z.enum(OPERATIONS as [string, ...string[]]),
  propertyType: z.enum(PROPERTY_TYPES as [string, ...string[]]),
  status: z.enum(PROPERTY_STATUSES as [string, ...string[]]),
  price: z.coerce.number().positive().max(10_000_000_000),
  currency,
  zoneId: z.string().min(1),
  neighborhood: optText(120),
  addressLine: optText(200),
  showExactLocation: z.boolean().default(false),
  latitude: coord(90),
  longitude: coord(180),
  bedrooms: optNum(50),
  bathrooms: optNum(50),
  parkingSpaces: optNum(50),
  constructionArea: optNum(1_000_000),
  landArea: optNum(10_000_000),
  ageYears: optNum(300),
  furnished: z.boolean().nullable().optional().transform((v) => v ?? null),
  features,
  contactWhatsapp: optText(30),
  branchId: optId,
  advisorUserId: optId,
  published: z.boolean().default(false),
});

export async function saveRealtyProperty(data: z.input<typeof propertySchema>) {
  const session = await requireRealtyOperator();
  const parsed = propertySchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa los datos de la propiedad.");
  const d = parsed.data;
  const id = await saveProperty(session.user.organizationId, session.user.id, {
    ...d,
    operation: d.operation as never,
    propertyType: d.propertyType as never,
    status: d.status as never,
    bedrooms: d.bedrooms === null ? null : Math.round(d.bedrooms),
    parkingSpaces: d.parkingSpaces === null ? null : Math.round(d.parkingSpaces),
    ageYears: d.ageYears === null ? null : Math.round(d.ageYears),
  });
  revalidateRealty();
  return { id };
}

const statusSchema = z.object({ propertyId: z.string().min(1), status: z.enum(PROPERTY_STATUSES as [string, ...string[]]), notes: optText(500) });

export async function changeRealtyPropertyStatus(data: z.input<typeof statusSchema>) {
  const session = await requireRealtyOperator();
  const parsed = statusSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Estado inválido.");
  await changePropertyStatus(session.user.organizationId, session.user.id, parsed.data.propertyId, parsed.data.status as never, parsed.data.notes);
  revalidateRealty();
}

export async function uploadRealtyPhotos(formData: FormData) {
  const session = await requireRealtyOperator();
  const propertyId = String(formData.get("propertyId") ?? "");
  if (!propertyId) throw new UserError("Propiedad no encontrada");
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new UserError("Elige al menos una foto.");
  if (files.length > 12) throw new UserError("Máximo 12 fotos por carga.");
  if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) throw new UserError("Cada foto debe pesar menos de 12 MB.");
  const buffers = await Promise.all(files.map(async (f) => ({ buffer: Buffer.from(await f.arrayBuffer()), type: f.type, name: f.name })));
  await addPropertyPhotos(session.user.organizationId, session.user.id, propertyId, buffers);
  revalidateRealty();
}

export async function deleteRealtyPhoto(mediaId: string) {
  const session = await requireRealtyOperator();
  await deletePropertyPhoto(session.user.organizationId, session.user.id, z.string().min(1).parse(mediaId));
  revalidateRealty();
}

export async function setRealtyCoverPhoto(mediaId: string) {
  const session = await requireRealtyOperator();
  await setCoverPhoto(session.user.organizationId, z.string().min(1).parse(mediaId));
  revalidateRealty();
}

// ─── Prospectos ─────────────────────────────────────────────────────────

const prospectSchema = z.object({
  id: z.string().optional(),
  leadId: optId,
  name: optText(120),
  phone: optText(30),
  email: z.string().trim().email().max(160).nullable().optional().or(z.literal("")).transform((v) => (v ? v : null)),
  operation: z.enum(OPERATIONS as [string, ...string[]]),
  propertyType: z.enum(PROPERTY_TYPES as [string, ...string[]]).nullable().optional().transform((v) => v ?? null),
  minBudget: optNum(10_000_000_000),
  maxBudget: z.coerce.number().positive().max(10_000_000_000),
  currency,
  minBedrooms: optNum(50),
  minBathrooms: optNum(50),
  minArea: optNum(10_000_000),
  moveTimeline: optText(80),
  financingNeeded: z.boolean().nullable().optional().transform((v) => v ?? null),
  preferences: features,
  zoneIds: z.array(z.string().min(1)).max(5).default([]),
  branchId: optId,
  advisorUserId: optId,
  active: z.boolean().default(true),
  source: optText(60),
});

export async function saveRealtyProspect(data: z.input<typeof prospectSchema>) {
  const session = await requireRealtyOperator();
  const parsed = prospectSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa los datos del prospecto.");
  const d = parsed.data;
  const id = await saveProspect(session.user.organizationId, session.user.id, {
    id: d.id,
    contact: { leadId: d.leadId, name: d.name, phone: d.phone, email: d.email, source: d.source },
    operation: d.operation as never,
    propertyType: d.propertyType as never,
    minBudget: d.minBudget,
    maxBudget: d.maxBudget,
    currency: d.currency,
    minBedrooms: d.minBedrooms === null ? null : Math.round(d.minBedrooms),
    minBathrooms: d.minBathrooms,
    minArea: d.minArea,
    moveTimeline: d.moveTimeline,
    financingNeeded: d.financingNeeded,
    preferences: d.preferences,
    zoneIds: d.zoneIds,
    branchId: d.branchId,
    advisorUserId: d.advisorUserId,
    active: d.active,
    source: d.source,
  });
  revalidateRealty(["/portal/leads"]);
  return { id };
}

export async function recomputeRealtyMatches() {
  const session = await requireRealtyManager();
  const n = await recomputeAllMatches(session.user.organizationId);
  revalidateRealty();
  return { count: n };
}

// ─── Visitas y cierres ──────────────────────────────────────────────────

const visitSchema = z.object({
  propertyId: z.string().min(1),
  profileId: optId,
  advisorUserId: optId,
  startTime: z.string().min(1),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(45),
  notes: optText(1000),
});

export async function scheduleRealtyVisit(data: z.input<typeof visitSchema>) {
  const session = await requireRealtyOperator();
  const parsed = visitSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa los datos de la visita.");
  const start = new Date(parsed.data.startTime);
  if (Number.isNaN(start.getTime())) throw new UserError("Fecha inválida.");
  const id = await scheduleVisit(session.user.organizationId, session.user.id, { ...parsed.data, startTime: start });
  revalidateRealty(["/portal/appointments"]);
  return { id };
}

const visitUpdateSchema = z.object({
  visitId: z.string().min(1),
  status: z.enum(["SCHEDULED", "CONFIRMED", "CANCELLED", "COMPLETED", "NO_SHOW"]),
  outcome: optText(1000),
});

export async function updateRealtyVisit(data: z.input<typeof visitUpdateSchema>) {
  const session = await requireRealtyOperator();
  const parsed = visitUpdateSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Datos inválidos.");
  await updateVisit(session.user.organizationId, session.user.id, parsed.data.visitId, { status: parsed.data.status, outcome: parsed.data.outcome });
  revalidateRealty(["/portal/appointments"]);
}

const closingSchema = z.object({
  propertyId: z.string().min(1),
  profileId: optId,
  advisorUserId: optId,
  opportunityId: optId,
  finalAmount: z.coerce.number().positive().max(10_000_000_000),
  commissionAmount: optNum(10_000_000_000),
  closedAt: z.string().min(1),
  notes: optText(1000),
});

export async function recordRealtyClosing(data: z.input<typeof closingSchema>) {
  const session = await requireRealtyOperator();
  const parsed = closingSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa los datos del cierre.");
  const closedAt = new Date(parsed.data.closedAt);
  if (Number.isNaN(closedAt.getTime())) throw new UserError("Fecha inválida.");
  const id = await recordClosing(session.user.organizationId, session.user.id, { ...parsed.data, closedAt });
  revalidateRealty();
  return { id };
}

// ─── Campañas, zonas y ajustes (gerencia) ───────────────────────────────

const campaignSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2).max(120),
  channel: z.enum(["META", "INSTAGRAM", "GOOGLE", "SMARTCARD", "WHATSAPP", "PORTAL", "REFERRAL", "OTHER"]),
  propertyId: optId,
  spend: z.coerce.number().min(0).max(1_000_000_000),
  startDate: z.string().min(1),
  endDate: z.string().nullable().optional(),
  leadsCount: z.coerce.number().int().min(0).max(1_000_000),
  visitsCount: z.coerce.number().int().min(0).max(1_000_000),
  closingsCount: z.coerce.number().int().min(0).max(1_000_000),
  attributedRevenue: optNum(10_000_000_000),
  status: z.enum(["ACTIVE", "PAUSED", "ENDED"]),
});

export async function saveRealtyCampaign(data: z.input<typeof campaignSchema>) {
  const session = await requireRealtyManager();
  const parsed = campaignSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa los datos de la campaña.");
  const start = new Date(parsed.data.startDate);
  const end = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime()))) throw new UserError("Fecha inválida.");
  const id = await saveCampaign(session.user.organizationId, session.user.id, { ...parsed.data, startDate: start, endDate: end });
  revalidateRealty();
  return { id };
}

export async function deleteRealtyCampaign(id: string) {
  const session = await requireRealtyManager();
  await deleteCampaign(session.user.organizationId, session.user.id, z.string().min(1).parse(id));
  revalidateRealty();
}

const zoneSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(2).max(80), latitude: coord(90), longitude: coord(180) });

export async function saveRealtyZone(data: z.input<typeof zoneSchema>) {
  const session = await requireRealtyManager();
  const parsed = zoneSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa los datos de la zona.");
  const id = await saveZone(session.user.organizationId, session.user.id, parsed.data);
  revalidateRealty();
  return { id };
}

export async function deleteRealtyZone(id: string) {
  const session = await requireRealtyManager();
  await deleteZone(session.user.organizationId, session.user.id, z.string().min(1).parse(id));
  revalidateRealty();
}

const settingsSchema = z.object({ publicWhatsapp: optText(30), defaultCurrency: currency });

export async function saveRealtySettings(data: z.input<typeof settingsSchema>) {
  const session = await requireRealtyManager();
  const parsed = settingsSchema.safeParse(data);
  if (!parsed.success) throw new UserError("Revisa los ajustes.");
  await saveSettings(session.user.organizationId, session.user.id, parsed.data);
  revalidateRealty();
}

/** Búsqueda de contactos del CRM para ligar un prospecto (solo lectura del Lead). */
export async function searchRealtyLeads(query: string) {
  const session = await requireRealtyOperator();
  const q = z.string().trim().max(80).parse(query);
  if (q.length < 2) return [];
  const { prisma } = await import("@/lib/prisma");
  return prisma.lead.findMany({
    where: { organizationId: session.user.organizationId, deletedAt: null, OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] },
    take: 8,
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, phone: true, email: true },
  });
}

/** Busca una dirección para ubicarla en el mapa (la persona confirma el pin antes de guardar). */
export async function geocodeRealtyAddress(query: string) {
  const session = await requireRealtyOperator();
  const q = z.string().trim().min(3).max(200).safeParse(query);
  if (!q.success) throw new UserError("Escribe la dirección para buscarla.");
  return geocodeAddress(session.user.organizationId, q.data);
}
