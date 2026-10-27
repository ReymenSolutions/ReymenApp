// Solo servidor. Mutaciones de REYMEN Ops Realty. Cada función recibe el
// organizationId de la SESIÓN (nunca del formulario) y comprueba que toda
// relación que llega del cliente (zona, sucursal, asesor, prospecto,
// propiedad, campaña, oportunidad) sea de esa misma organización.

import { randomBytes } from "node:crypto";
import { Prisma, type AppointmentStatus, type RealtyCampaignChannel, type RealtyCampaignStatus, type RealtyOperation, type RealtyPropertyStatus, type RealtyPropertyType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { assertOrgUser } from "@/lib/org-guards";
import { recordMetric, METRIC_KEYS } from "@/lib/metrics";
import { UserError } from "@/lib/user-error";
import { OPEN_STATUSES, propertySlug, zoneKey } from "./constants";
import { MATCH_VERSION, computeMatch, type MatchProfile, type MatchProperty } from "./match";
import { ensureLeadForProspect, type ProspectContact } from "./lead-adapter";
import { MAX_PHOTOS_PER_PROPERTY, processPropertyImage } from "./media";

/** Matches por debajo de esto no se guardan (no aportan y llenarían la tabla). */
export const MIN_STORED_MATCH = 40;

export const num = (d: Prisma.Decimal | number | null | undefined): number | null => (d === null || d === undefined ? null : Number(d));

// ─── Pertenencia a la organización ──────────────────────────────────────

async function assertZone(organizationId: string, zoneId: string) {
  const z = await prisma.realtyZone.findFirst({ where: { id: zoneId, organizationId }, select: { id: true } });
  if (!z) throw new UserError("Zona no encontrada");
}
async function assertBranch(organizationId: string, branchId: string) {
  const b = await prisma.branch.findFirst({ where: { id: branchId, organizationId, isActive: true }, select: { id: true } });
  if (!b) throw new UserError("Sucursal no encontrada");
}
export async function assertProperty(organizationId: string, propertyId: string) {
  const p = await prisma.realtyProperty.findFirst({ where: { id: propertyId, organizationId } });
  if (!p) throw new UserError("Propiedad no encontrada");
  return p;
}
export async function assertProfile(organizationId: string, profileId: string) {
  const p = await prisma.realtyLeadProfile.findFirst({ where: { id: profileId, organizationId } });
  if (!p) throw new UserError("Prospecto no encontrado");
  return p;
}

// ─── Zonas y ajustes ────────────────────────────────────────────────────

export interface ColoniaAddress {
  colonia: string;
  postalCode: string | null;
  municipality: string | null;
}

/**
 * La zona de una propiedad (y de lo que busca un prospecto) es su colonia:
 * nadie la elige a mano. Devuelve la zona de esa colonia y la crea si no
 * existe. Se identifica por colonia + CP (hay colonias con el mismo nombre en
 * varios municipios, p. ej. "Centro"); una zona con ese nombre y sin CP (de
 * antes) se reusa y se le completa el CP.
 */
export async function ensureColoniaZone(organizationId: string, userId: string | null, a: ColoniaAddress): Promise<{ id: string; name: string; created: boolean }> {
  const name = a.colonia.trim().replace(/\s+/g, " ").slice(0, 80);
  const nameKey = zoneKey(name);
  if (name.length < 2 || !nameKey) throw new UserError("Elige la colonia de la propiedad.");
  const cp = a.postalCode && /^\d{5}$/.test(a.postalCode) ? a.postalCode : null;

  const candidates = await prisma.realtyZone.findMany({
    where: { organizationId, OR: [{ key: nameKey }, { key: { startsWith: `${nameKey}-` } }] },
    select: { id: true, name: true, key: true, postalCode: true },
  });
  const sameName = candidates.filter((z) => zoneKey(z.name.replace(/\s*\([^)]*\)\s*$/, "")) === nameKey);
  const found = sameName.find((z) => z.postalCode === cp) ?? sameName.find((z) => !z.postalCode || !cp);
  if (found) {
    if (!found.postalCode && cp) await prisma.realtyZone.update({ where: { id: found.id }, data: { postalCode: cp } });
    return { id: found.id, name: found.name, created: false };
  }

  // Otra colonia con el mismo nombre (otro CP): se distingue por municipio o CP.
  const taken = new Set(candidates.map((z) => z.key));
  let displayName = name;
  let key = nameKey;
  if (taken.has(key)) {
    displayName = `${name} (${a.municipality?.trim() || cp || "2"})`.slice(0, 80);
    key = zoneKey(`${name} ${cp ?? a.municipality ?? ""}`) || `${nameKey}-2`;
    for (let i = 2; taken.has(key); i++) key = `${zoneKey(`${name} ${cp ?? ""}`)}-${i}`;
  }
  const zone = await prisma.realtyZone.create({ data: { organizationId, name: displayName, key, postalCode: cp, latitude: null, longitude: null }, select: { id: true } });
  await logAudit({ organizationId, userId, action: "realty.zone.create", resource: "RealtyZone", resourceId: zone.id, metadata: { name: displayName, via: "colonia" } });
  return { id: zone.id, name: displayName, created: true };
}

export async function saveZone(organizationId: string, userId: string, input: { id?: string; name: string; postalCode?: string | null; latitude: number | null; longitude: number | null }) {
  const key = zoneKey(input.name);
  if (!key) throw new UserError("Nombre de zona inválido");
  const dupe = await prisma.realtyZone.findFirst({ where: { organizationId, key, ...(input.id ? { id: { not: input.id } } : {}) }, select: { id: true } });
  if (dupe) throw new UserError("Ya existe una zona con ese nombre.");
  const data = { name: input.name.trim(), key, postalCode: input.postalCode ?? null, latitude: input.latitude, longitude: input.longitude };
  let zoneId = input.id;
  if (zoneId) {
    await assertZone(organizationId, zoneId);
    await prisma.realtyZone.update({ where: { id: zoneId }, data });
  } else {
    zoneId = (await prisma.realtyZone.create({ data: { organizationId, ...data } })).id;
  }
  await logAudit({ organizationId, userId, action: input.id ? "realty.zone.update" : "realty.zone.create", resource: "RealtyZone", resourceId: zoneId, metadata: { name: data.name } });
  return zoneId;
}

export async function deleteZone(organizationId: string, userId: string, zoneId: string) {
  await assertZone(organizationId, zoneId);
  const [props, asks] = await Promise.all([
    prisma.realtyProperty.count({ where: { organizationId, zoneId } }),
    prisma.realtyLeadZone.count({ where: { organizationId, zoneId } }),
  ]);
  if (props > 0 || asks > 0) throw new UserError("La zona tiene propiedades o prospectos: muévelos antes de borrarla.");
  await prisma.realtyZone.delete({ where: { id: zoneId } });
  await logAudit({ organizationId, userId, action: "realty.zone.delete", resource: "RealtyZone", resourceId: zoneId });
}

export async function saveSettings(organizationId: string, userId: string, input: { publicWhatsapp: string | null; defaultCurrency: string }) {
  await prisma.realtySettings.upsert({
    where: { organizationId },
    create: { organizationId, publicWhatsapp: input.publicWhatsapp, defaultCurrency: input.defaultCurrency },
    update: { publicWhatsapp: input.publicWhatsapp, defaultCurrency: input.defaultCurrency },
  });
  await logAudit({ organizationId, userId, action: "realty.settings.update", resource: "RealtySettings", metadata: { defaultCurrency: input.defaultCurrency } });
}

// ─── Propiedades ────────────────────────────────────────────────────────

export interface PropertyInput {
  id?: string;
  title: string;
  description: string | null;
  operation: RealtyOperation;
  propertyType: RealtyPropertyType;
  status: RealtyPropertyStatus;
  price: number;
  currency: string;
  /** Solo propiedades de antes sin colonia: con colonia, la zona se calcula de ella. */
  zoneId?: string | null;
  postalCode: string | null;
  neighborhood: string | null;
  municipality: string | null;
  state: string | null;
  addressLine: string | null;
  showExactLocation: boolean;
  latitude: number | null;
  longitude: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parkingSpaces: number | null;
  constructionArea: number | null;
  landArea: number | null;
  ageYears: number | null;
  furnished: boolean | null;
  features: string[];
  contactWhatsapp: string | null;
  branchId: string | null;
  advisorUserId: string | null;
  published: boolean;
}

export async function saveProperty(organizationId: string, userId: string, input: PropertyInput): Promise<string> {
  if (input.branchId) await assertBranch(organizationId, input.branchId);
  if (input.advisorUserId) await assertOrgUser(organizationId, input.advisorUserId);
  // La zona es la colonia. Sin colonia solo se acepta en una propiedad de antes, que conserva su zona.
  let zoneId: string;
  if (input.neighborhood?.trim()) {
    zoneId = (await ensureColoniaZone(organizationId, userId, { colonia: input.neighborhood, postalCode: input.postalCode, municipality: input.municipality })).id;
  } else if (input.id) {
    zoneId = (await assertProperty(organizationId, input.id)).zoneId;
  } else if (input.zoneId) {
    await assertZone(organizationId, input.zoneId);
    zoneId = input.zoneId;
  } else {
    throw new UserError("Elige la colonia de la propiedad.");
  }
  const { id, published, status, zoneId: _ignored, ...rest } = input;
  void _ignored;
  const data = { ...rest, zoneId, price: new Prisma.Decimal(input.price) };
  let propertyId: string;
  if (id) {
    const before = await assertProperty(organizationId, id);
    await prisma.$transaction(async (tx) => {
      await tx.realtyProperty.update({
        where: { id },
        data: { ...data, status, publishedAt: published ? (before.publishedAt ?? new Date()) : null },
      });
      if (before.status !== status) {
        await tx.realtyPropertyStatusHistory.create({ data: { organizationId, propertyId: id, fromStatus: before.status, toStatus: status, changedById: userId } });
      }
    });
    propertyId = id;
    await logAudit({ organizationId, userId, action: "realty.property.update", resource: "RealtyProperty", resourceId: id, metadata: { title: input.title, status, fromStatus: before.status } });
  } else {
    propertyId = await prisma.$transaction(async (tx) => {
      const created = await tx.realtyProperty.create({
        data: { organizationId, ...data, status, slug: propertySlug(input.title, randomBytes(4).toString("hex")), publishedAt: published ? new Date() : null },
      });
      await tx.realtyPropertyStatusHistory.create({ data: { organizationId, propertyId: created.id, fromStatus: null, toStatus: status, changedById: userId } });
      return created.id;
    });
    await logAudit({ organizationId, userId, action: "realty.property.create", resource: "RealtyProperty", resourceId: propertyId, metadata: { title: input.title } });
  }
  await recomputeMatchesForProperty(organizationId, propertyId);
  return propertyId;
}

export async function changePropertyStatus(organizationId: string, userId: string, propertyId: string, toStatus: RealtyPropertyStatus, notes: string | null) {
  const before = await assertProperty(organizationId, propertyId);
  if (before.status === toStatus) return;
  await prisma.$transaction([
    prisma.realtyProperty.update({ where: { id: propertyId }, data: { status: toStatus } }),
    prisma.realtyPropertyStatusHistory.create({ data: { organizationId, propertyId, fromStatus: before.status, toStatus, changedById: userId, notes } }),
  ]);
  await logAudit({ organizationId, userId, action: "realty.property.status", resource: "RealtyProperty", resourceId: propertyId, metadata: { from: before.status, to: toStatus } });
  await recomputeMatchesForProperty(organizationId, propertyId);
}

export async function addPropertyPhotos(organizationId: string, userId: string, propertyId: string, files: { buffer: Buffer; type: string; name: string }[]) {
  await assertProperty(organizationId, propertyId);
  const current = await prisma.realtyPropertyMedia.count({ where: { organizationId, propertyId } });
  if (current + files.length > MAX_PHOTOS_PER_PROPERTY) throw new UserError(`Máximo ${MAX_PHOTOS_PER_PROPERTY} fotos por propiedad.`);
  const processed = [];
  for (const f of files) processed.push(await processPropertyImage(f.buffer, f.type));
  const last = await prisma.realtyPropertyMedia.findFirst({ where: { organizationId, propertyId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  let order = (last?.sortOrder ?? -1) + 1;
  await prisma.realtyPropertyMedia.createMany({
    data: processed.map((p) => ({ organizationId, propertyId, mimeType: p.mimeType, data: new Uint8Array(p.data), width: p.width, height: p.height, sortOrder: order++ })),
  });
  await logAudit({ organizationId, userId, action: "realty.media.add", resource: "RealtyProperty", resourceId: propertyId, metadata: { count: files.length } });
}

export async function deletePropertyPhoto(organizationId: string, userId: string, mediaId: string) {
  const m = await prisma.realtyPropertyMedia.findFirst({ where: { id: mediaId, organizationId }, select: { id: true, propertyId: true } });
  if (!m) throw new UserError("Foto no encontrada");
  await prisma.realtyPropertyMedia.delete({ where: { id: m.id } });
  await logAudit({ organizationId, userId, action: "realty.media.delete", resource: "RealtyProperty", resourceId: m.propertyId });
  return m.propertyId;
}

/** La foto elegida pasa a portada (orden 0); las demás conservan su orden relativo. */
export async function setCoverPhoto(organizationId: string, mediaId: string) {
  const m = await prisma.realtyPropertyMedia.findFirst({ where: { id: mediaId, organizationId }, select: { id: true, propertyId: true } });
  if (!m) throw new UserError("Foto no encontrada");
  const all = await prisma.realtyPropertyMedia.findMany({ where: { organizationId, propertyId: m.propertyId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  const ordered = [m.id, ...all.map((x) => x.id).filter((x) => x !== m.id)];
  await prisma.$transaction(ordered.map((id, i) => prisma.realtyPropertyMedia.update({ where: { id }, data: { sortOrder: i } })));
  return m.propertyId;
}

// ─── Prospectos ─────────────────────────────────────────────────────────

export interface ProspectInput {
  id?: string;
  contact: ProspectContact;
  operation: RealtyOperation;
  propertyType: RealtyPropertyType | null;
  minBudget: number | null;
  maxBudget: number;
  currency: string;
  minBedrooms: number | null;
  minBathrooms: number | null;
  minArea: number | null;
  moveTimeline: string | null;
  financingNeeded: boolean | null;
  preferences: string[];
  /** En orden de prioridad. */
  zoneIds: string[];
  branchId: string | null;
  advisorUserId: string | null;
  active: boolean;
  source: string | null;
  /** Landing de la que llegó y consentimiento dado (solo formulario público). */
  sourcePropertyId?: string | null;
  consent?: { version: string; at: Date };
}

/** `userId` null = captura pública (formulario de la landing): se audita sin usuario. */
export async function saveProspect(organizationId: string, userId: string | null, input: ProspectInput): Promise<string> {
  if (input.minBudget !== null && input.minBudget > input.maxBudget) throw new UserError("El presupuesto mínimo no puede ser mayor que el máximo.");
  const zoneIds = [...new Set(input.zoneIds)].slice(0, 5);
  const zones = await prisma.realtyZone.count({ where: { organizationId, id: { in: zoneIds } } });
  if (zones !== zoneIds.length) throw new UserError("Zona no encontrada");
  if (input.branchId) await assertBranch(organizationId, input.branchId);
  if (input.advisorUserId) await assertOrgUser(organizationId, input.advisorUserId);

  const before = input.id ? await assertProfile(organizationId, input.id) : null;
  // El contacto vive en el CRM: al crear se resuelve (o crea) el Lead; al editar se conserva, salvo que se elija otro.
  const leadId = before && !input.contact.leadId && !input.contact.name ? before.leadId : (await ensureLeadForProspect(organizationId, userId, input.contact)).leadId;

  const data = {
    leadId,
    operation: input.operation,
    propertyType: input.propertyType,
    minBudget: input.minBudget === null ? null : new Prisma.Decimal(input.minBudget),
    maxBudget: new Prisma.Decimal(input.maxBudget),
    currency: input.currency,
    minBedrooms: input.minBedrooms,
    minBathrooms: input.minBathrooms,
    minArea: input.minArea,
    moveTimeline: input.moveTimeline,
    financingNeeded: input.financingNeeded,
    preferences: input.preferences,
    branchId: input.branchId,
    advisorUserId: input.advisorUserId,
    active: input.active,
    source: input.source,
    // Solo cuando llega del formulario público: no se borra al editar a mano.
    ...(input.sourcePropertyId !== undefined ? { sourcePropertyId: input.sourcePropertyId } : {}),
    ...(input.consent ? { consentVersion: input.consent.version, consentAt: input.consent.at } : {}),
  };
  const profileId = await prisma.$transaction(async (tx) => {
    const id = before ? (await tx.realtyLeadProfile.update({ where: { id: before.id }, data })).id : (await tx.realtyLeadProfile.create({ data: { organizationId, ...data } })).id;
    await tx.realtyLeadZone.deleteMany({ where: { profileId: id } });
    if (zoneIds.length) await tx.realtyLeadZone.createMany({ data: zoneIds.map((zoneId, i) => ({ organizationId, profileId: id, zoneId, priority: i + 1 })) });
    return id;
  });
  await logAudit({ organizationId, userId, action: before ? "realty.prospect.update" : "realty.prospect.create", resource: "RealtyLeadProfile", resourceId: profileId, metadata: { leadId, operation: input.operation } });
  // Si la IA había propuesto un perfil para este contacto, crearlo a mano (o editando la propuesta) la deja resuelta.
  if (!before && leadId) await prisma.realtyProfileSuggestion.updateMany({ where: { organizationId, leadId, status: "PENDING" }, data: { status: "ACCEPTED", resolvedById: userId, resolvedAt: new Date(), profileId } });
  await recomputeMatchesForProfile(organizationId, profileId);
  return profileId;
}

// ─── Matches (reglas de match.ts; se guardan para listarlos rápido) ─────

type ProfileRow = Prisma.RealtyLeadProfileGetPayload<{ include: { zones: { select: { zoneId: true; priority: true } } } }>;
type PropertyRow = Pick<Prisma.RealtyPropertyGetPayload<object>, "id" | "operation" | "propertyType" | "price" | "zoneId" | "bedrooms" | "bathrooms" | "constructionArea" | "landArea" | "features">;

export function toMatchProfile(p: ProfileRow): MatchProfile {
  return {
    operation: p.operation,
    propertyType: p.propertyType,
    minBudget: num(p.minBudget),
    maxBudget: Number(p.maxBudget),
    zoneIds: [...p.zones].sort((a, b) => a.priority - b.priority).map((z) => z.zoneId),
    minBedrooms: p.minBedrooms,
    minBathrooms: p.minBathrooms,
    minArea: p.minArea,
    preferences: p.preferences,
  };
}

export function toMatchProperty(p: PropertyRow): MatchProperty {
  return { operation: p.operation, propertyType: p.propertyType, price: Number(p.price), zoneId: p.zoneId, bedrooms: p.bedrooms, bathrooms: p.bathrooms, constructionArea: p.constructionArea, landArea: p.landArea, features: p.features };
}

const PROPERTY_MATCH_SELECT = { id: true, operation: true, propertyType: true, price: true, zoneId: true, bedrooms: true, bathrooms: true, constructionArea: true, landArea: true, features: true } as const;

async function writeMatches(organizationId: string, scope: { profileId?: string; propertyId?: string }, rows: { profileId: string; propertyId: string; m: ReturnType<typeof computeMatch> }[]) {
  const keep = rows.filter((r) => r.m.eligible && r.m.total >= MIN_STORED_MATCH);
  await prisma.$transaction([
    prisma.realtyMatch.deleteMany({ where: { organizationId, ...scope } }),
    prisma.realtyMatch.createMany({
      data: keep.map((r) => ({
        organizationId,
        profileId: r.profileId,
        propertyId: r.propertyId,
        totalScore: r.m.total,
        budgetScore: r.m.budget,
        zoneScore: r.m.zone,
        typeScore: r.m.type,
        roomsScore: r.m.rooms,
        areaScore: r.m.area,
        extrasScore: r.m.extras,
        calculationVersion: MATCH_VERSION,
      })),
    }),
  ]);
  return keep.length;
}

export async function recomputeMatchesForProfile(organizationId: string, profileId: string) {
  const profile = await prisma.realtyLeadProfile.findFirst({ where: { id: profileId, organizationId }, include: { zones: { select: { zoneId: true, priority: true } } } });
  if (!profile) return 0;
  if (!profile.active) return writeMatches(organizationId, { profileId }, []);
  const properties = await prisma.realtyProperty.findMany({ where: { organizationId, status: { in: OPEN_STATUSES }, operation: profile.operation }, select: PROPERTY_MATCH_SELECT });
  const mp = toMatchProfile(profile);
  return writeMatches(organizationId, { profileId }, properties.map((p) => ({ profileId, propertyId: p.id, m: computeMatch(mp, toMatchProperty(p)) })));
}

export async function recomputeMatchesForProperty(organizationId: string, propertyId: string) {
  const property = await prisma.realtyProperty.findFirst({ where: { id: propertyId, organizationId }, select: { ...PROPERTY_MATCH_SELECT, status: true } });
  if (!property) return 0;
  if (!OPEN_STATUSES.includes(property.status)) return writeMatches(organizationId, { propertyId }, []);
  const profiles = await prisma.realtyLeadProfile.findMany({ where: { organizationId, active: true, operation: property.operation }, include: { zones: { select: { zoneId: true, priority: true } } } });
  const mp = toMatchProperty(property);
  return writeMatches(organizationId, { propertyId }, profiles.map((p) => ({ profileId: p.id, propertyId, m: computeMatch(toMatchProfile(p), mp) })));
}

/** Recalcula todo (después de cambiar reglas o del seed). */
export async function recomputeAllMatches(organizationId: string) {
  const profiles = await prisma.realtyLeadProfile.findMany({ where: { organizationId }, select: { id: true } });
  let n = 0;
  for (const p of profiles) n += await recomputeMatchesForProfile(organizationId, p.id);
  return n;
}

// ─── Visitas (Appointment del CRM + la propiedad) ───────────────────────

const LIVE: AppointmentStatus[] = ["SCHEDULED", "CONFIRMED"];

export interface VisitInput {
  propertyId: string;
  profileId: string | null;
  advisorUserId: string | null;
  startTime: Date;
  durationMinutes: number;
  notes: string | null;
  /** Contacto del CRM de la visita cuando no hay perfil de búsqueda (solicitud desde la landing). */
  leadId?: string | null;
  /** Origen de la cita en Citas (por omisión «realty»). */
  source?: string;
  /** Texto de la cita si difiere de las notas (p. ej. datos de contacto cuando no hay Lead). */
  description?: string | null;
}

/**
 * Agenda la visita como una cita normal del CRM (aparece también en
 * /portal/appointments) y la liga a la propiedad. No usa la regla de
 * "una cita a la vez" de la agenda general: varios asesores muestran casas
 * al mismo tiempo. Solo evita empalmar la misma propiedad o el mismo asesor.
 */
/** `userId` null = solicitud pública desde la landing. */
export async function scheduleVisit(organizationId: string, userId: string | null, input: VisitInput) {
  const property = await assertProperty(organizationId, input.propertyId);
  if (!OPEN_STATUSES.includes(property.status)) throw new UserError("La propiedad ya no está disponible para visitas.");
  const profile = input.profileId ? await assertProfile(organizationId, input.profileId) : null;
  if (input.advisorUserId) await assertOrgUser(organizationId, input.advisorUserId);
  const start = input.startTime;
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const leadRef = input.leadId ?? profile?.leadId ?? null;
  const lead = leadRef ? await prisma.lead.findFirst({ where: { id: leadRef, organizationId }, select: { id: true, name: true } }) : null;

  const visitId = await prisma.$transaction(
    async (tx) => {
      const clash = await tx.realtyPropertyVisit.findFirst({
        where: {
          organizationId,
          OR: [{ propertyId: property.id }, ...(input.advisorUserId ? [{ advisorUserId: input.advisorUserId }] : [])],
          appointment: { status: { in: LIVE }, startTime: { lt: end }, endTime: { gt: start } },
        },
        select: { propertyId: true },
      });
      if (clash) throw new UserError(clash.propertyId === property.id ? "Ya hay una visita a esta propiedad en ese horario." : "El asesor ya tiene una visita en ese horario.");
      const appt = await tx.appointment.create({
        data: {
          organizationId,
          leadId: lead?.id ?? null,
          title: `Visita: ${property.title}`.slice(0, 190),
          description: input.description ?? input.notes,
          startTime: start,
          endTime: end,
          source: input.source ?? "realty",
          metadata: { realtyPropertyId: property.id },
        },
      });
      const v = await tx.realtyPropertyVisit.create({ data: { organizationId, appointmentId: appt.id, propertyId: property.id, profileId: profile?.id ?? null, advisorUserId: input.advisorUserId } });
      return v.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  ).catch((err) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") throw new UserError("Ese horario se acaba de ocupar; intenta de nuevo.");
    throw err;
  });
  await recordMetric(organizationId, METRIC_KEYS.APPOINTMENTS_BOOKED);
  await logAudit({ organizationId, userId, action: "realty.visit.create", resource: "RealtyPropertyVisit", resourceId: visitId, metadata: { propertyId: property.id, profileId: profile?.id ?? null } });
  return visitId;
}

export async function updateVisit(organizationId: string, userId: string, visitId: string, input: { status: AppointmentStatus; outcome: string | null }) {
  const v = await prisma.realtyPropertyVisit.findFirst({ where: { id: visitId, organizationId }, select: { id: true, appointmentId: true } });
  if (!v) throw new UserError("Visita no encontrada");
  await prisma.$transaction([
    prisma.appointment.update({ where: { id: v.appointmentId }, data: { status: input.status } }),
    prisma.realtyPropertyVisit.update({ where: { id: v.id }, data: { outcome: input.outcome } }),
  ]);
  await logAudit({ organizationId, userId, action: "realty.visit.update", resource: "RealtyPropertyVisit", resourceId: v.id, metadata: { status: input.status } });
}

// ─── Cierres ────────────────────────────────────────────────────────────

export interface ClosingInput {
  propertyId: string;
  profileId: string | null;
  advisorUserId: string | null;
  opportunityId: string | null;
  finalAmount: number;
  commissionAmount: number | null;
  closedAt: Date;
  notes: string | null;
}

/** Registra el cierre, marca la propiedad vendida/rentada (con historial) y desactiva al prospecto. No toca el CRM. */
export async function recordClosing(organizationId: string, userId: string, input: ClosingInput) {
  const property = await assertProperty(organizationId, input.propertyId);
  if (property.status === "SOLD" || property.status === "RENTED") throw new UserError("La propiedad ya tiene un cierre.");
  if (input.profileId) await assertProfile(organizationId, input.profileId);
  if (input.advisorUserId) await assertOrgUser(organizationId, input.advisorUserId);
  if (input.opportunityId) {
    const o = await prisma.opportunity.findFirst({ where: { id: input.opportunityId, organizationId }, select: { id: true } });
    if (!o) throw new UserError("Oportunidad no encontrada");
  }
  const toStatus: RealtyPropertyStatus = property.operation === "RENT" ? "RENTED" : "SOLD";
  const closing = await prisma.$transaction(async (tx) => {
    const c = await tx.realtyClosing.create({
      data: {
        organizationId,
        propertyId: property.id,
        profileId: input.profileId,
        advisorUserId: input.advisorUserId ?? property.advisorUserId,
        opportunityId: input.opportunityId,
        operation: property.operation,
        finalAmount: new Prisma.Decimal(input.finalAmount),
        currency: property.currency,
        commissionAmount: input.commissionAmount === null ? null : new Prisma.Decimal(input.commissionAmount),
        closedAt: input.closedAt,
        notes: input.notes,
      },
    });
    await tx.realtyProperty.update({ where: { id: property.id }, data: { status: toStatus } });
    await tx.realtyPropertyStatusHistory.create({ data: { organizationId, propertyId: property.id, fromStatus: property.status, toStatus, changedById: userId, notes: "Cierre registrado" } });
    if (input.profileId) await tx.realtyLeadProfile.update({ where: { id: input.profileId }, data: { active: false } });
    return c;
  });
  await logAudit({ organizationId, userId, action: "realty.closing.create", resource: "RealtyClosing", resourceId: closing.id, metadata: { propertyId: property.id, amount: input.finalAmount } });
  await recomputeMatchesForProperty(organizationId, property.id);
  if (input.profileId) await recomputeMatchesForProfile(organizationId, input.profileId);
  return closing.id;
}

// ─── Campañas (registro manual; no es un Ads Manager) ───────────────────

export interface CampaignInputData {
  id?: string;
  name: string;
  channel: RealtyCampaignChannel;
  propertyId: string | null;
  spend: number;
  startDate: Date;
  endDate: Date | null;
  leadsCount: number;
  visitsCount: number;
  closingsCount: number;
  attributedRevenue: number | null;
  status: RealtyCampaignStatus;
}

export async function saveCampaign(organizationId: string, userId: string, input: CampaignInputData) {
  if (input.propertyId) await assertProperty(organizationId, input.propertyId);
  if (input.endDate && input.endDate < input.startDate) throw new UserError("La fecha de fin no puede ser anterior al inicio.");
  const { id, ...rest } = input;
  const data = { ...rest, spend: new Prisma.Decimal(input.spend), attributedRevenue: input.attributedRevenue === null ? null : new Prisma.Decimal(input.attributedRevenue) };
  let campaignId = id;
  if (campaignId) {
    const c = await prisma.realtyCampaign.findFirst({ where: { id: campaignId, organizationId }, select: { id: true } });
    if (!c) throw new UserError("Campaña no encontrada");
    await prisma.realtyCampaign.update({ where: { id: campaignId }, data });
  } else {
    campaignId = (await prisma.realtyCampaign.create({ data: { organizationId, ...data } })).id;
  }
  await logAudit({ organizationId, userId, action: id ? "realty.campaign.update" : "realty.campaign.create", resource: "RealtyCampaign", resourceId: campaignId, metadata: { name: input.name, channel: input.channel } });
  return campaignId;
}

export async function deleteCampaign(organizationId: string, userId: string, campaignId: string) {
  const c = await prisma.realtyCampaign.findFirst({ where: { id: campaignId, organizationId }, select: { id: true } });
  if (!c) throw new UserError("Campaña no encontrada");
  await prisma.realtyCampaign.delete({ where: { id: c.id } });
  await logAudit({ organizationId, userId, action: "realty.campaign.delete", resource: "RealtyCampaign", resourceId: c.id });
}
