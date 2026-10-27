// Perfil de búsqueda que el Agente IA propone a partir de una conversación de WhatsApp/webchat. La IA solo propone:
// una persona lo acepta (se crea el perfil), lo edita en el formulario o lo descarta. Nunca se crea solo.
// Solo servidor (Prisma); parseSuggestion y matchZones son puros.

import { Prisma, type RealtyOperation, type RealtyPropertyType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasModule } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";
import { sendEmail } from "@/lib/email";
import { renderBrandedEmail } from "@/lib/email-template";
import { appUrl } from "@/lib/app-url";
import { FEATURES, OPERATIONS, PROPERTY_TYPES, zoneKey } from "./constants";
import { saveProspect } from "./service";

/** Si una persona descartó una propuesta, la IA no vuelve a proponer para ese contacto durante este tiempo. */
export const REJECT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ZONE_NAMES = 5;

export interface ParsedSuggestion {
  operation: RealtyOperation;
  propertyType: RealtyPropertyType | null;
  minBudget: number | null;
  maxBudget: number;
  zoneNames: string[];
  minBedrooms: number | null;
  preferences: string[];
  moveTimeline: string | null;
}

const posNum = (v: unknown, max: number): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[,\s$]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 && n <= max ? n : null;
};

/**
 * Valida lo que devolvió el modelo. Exige compra/renta y un presupuesto máximo: sin eso no hay un perfil usable y
 * no se propone nada (mejor callar que inventar). Zonas y extras se limpian; lo desconocido se ignora.
 */
export function parseSuggestion(raw: unknown): ParsedSuggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const operation = (OPERATIONS as string[]).includes(p.operation as string) ? (p.operation as RealtyOperation) : null;
  const maxBudget = posNum(p.max_budget, 10_000_000_000);
  if (!operation || !maxBudget) return null;
  let minBudget = posNum(p.min_budget, 10_000_000_000);
  if (minBudget !== null && minBudget > maxBudget) minBudget = null;
  const propertyType = (PROPERTY_TYPES as string[]).includes(p.property_type as string) ? (p.property_type as RealtyPropertyType) : null;
  const zoneNames = Array.isArray(p.zones)
    ? [...new Set(p.zones.filter((z): z is string => typeof z === "string").map((z) => z.trim().slice(0, 80)).filter(Boolean))].slice(0, MAX_ZONE_NAMES)
    : [];
  const bedrooms = posNum(p.min_bedrooms, 50);
  const preferences = Array.isArray(p.preferences) ? [...new Set(p.preferences.filter((f): f is string => typeof f === "string" && (FEATURES as readonly string[]).includes(f)))] : [];
  const timeline = typeof p.move_timeline === "string" ? p.move_timeline.trim().slice(0, 80) : "";
  return { operation, propertyType, minBudget, maxBudget, zoneNames, minBedrooms: bedrooms === null ? null : Math.round(bedrooms), preferences, moveTimeline: timeline || null };
}

/** Empareja los nombres que dijo el cliente con las zonas registradas (por clave sin acentos). Devuelve ids y los que no se encontraron. */
export function matchZones(names: string[], zones: { id: string; name: string; key: string }[]): { zoneIds: string[]; unmatched: string[] } {
  const byKey = new Map(zones.map((z) => [z.key || zoneKey(z.name), z.id]));
  const zoneIds: string[] = [];
  const unmatched: string[] = [];
  for (const n of names) {
    const id = byKey.get(zoneKey(n));
    if (id) {
      if (!zoneIds.includes(id)) zoneIds.push(id);
    } else unmatched.push(n);
  }
  return { zoneIds, unmatched };
}

/** Guarda la propuesta si procede: módulo activo, sin perfil activo, sin otra pendiente y sin descarte reciente. */
export async function recordProfileSuggestion(organizationId: string, input: { leadId: string; messageId: string; reason: string; raw: unknown; now?: Date }): Promise<boolean> {
  const parsed = parseSuggestion(input.raw);
  if (!parsed || !(await hasModule(organizationId, "REALTY"))) return false;
  const now = input.now ?? new Date();
  const [activeProfile, existing] = await Promise.all([
    prisma.realtyLeadProfile.findFirst({ where: { organizationId, leadId: input.leadId, active: true }, select: { id: true } }),
    prisma.realtyProfileSuggestion.findFirst({
      where: { organizationId, leadId: input.leadId, OR: [{ status: "PENDING" }, { status: "REJECTED", resolvedAt: { gte: new Date(now.getTime() - REJECT_COOLDOWN_MS) } }] },
      select: { id: true },
    }),
  ]);
  if (activeProfile || existing) return false;
  await prisma.realtyProfileSuggestion.create({
    data: {
      organizationId,
      leadId: input.leadId,
      operation: parsed.operation,
      propertyType: parsed.propertyType,
      minBudget: parsed.minBudget === null ? null : new Prisma.Decimal(parsed.minBudget),
      maxBudget: new Prisma.Decimal(parsed.maxBudget),
      zoneNames: parsed.zoneNames,
      minBedrooms: parsed.minBedrooms,
      preferences: parsed.preferences,
      moveTimeline: parsed.moveTimeline,
      reason: input.reason.slice(0, 300),
      basedOnMessageId: input.messageId,
    },
  });
  await logAudit({ organizationId, action: "realty.profile_suggestion.create", resource: "Lead", resourceId: input.leadId, metadata: { operation: parsed.operation } });
  await notifySuggestion(organizationId, input.leadId, parsed).catch(() => undefined);
  return true;
}

/** Correo al asesor del contacto (o, sin asesor, a quien administra el negocio): la IA propone un perfil y hay que revisarlo. Un fallo nunca rompe el análisis. */
async function notifySuggestion(organizationId: string, leadId: string, p: ParsedSuggestion) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId }, select: { name: true, assignedTo: true } });
  if (!lead) return;
  const advisor = lead.assignedTo ? await prisma.user.findFirst({ where: { id: lead.assignedTo, organizationId, isActive: true }, select: { email: true } }) : null;
  const recipients = advisor ? [advisor.email] : (await prisma.user.findMany({ where: { organizationId, role: { in: ["OWNER", "ADMIN", "MANAGER"] }, isActive: true }, select: { email: true } })).map((u) => u.email);
  if (!recipients.length) return;
  const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(p.maxBudget);
  const { html, text } = renderBrandedEmail({
    preheader: `${lead.name} · la IA propone su perfil de búsqueda`,
    title: "La IA detectó lo que busca un contacto",
    intro: `Por la conversación con ${lead.name}, la IA propone este perfil de búsqueda. No se guarda nada hasta que lo aceptes, lo edites o lo descartes.`,
    rows: [
      { label: "Busca", value: `${p.operation === "RENT" ? "Rentar" : "Comprar"}${p.propertyType ? ` · ${p.propertyType}` : ""}` },
      { label: "Presupuesto", value: `Hasta ${money}` },
      ...(p.zoneNames.length ? [{ label: "Colonias", value: p.zoneNames.join(", ") }] : []),
    ],
    actions: [{ label: "Revisar propuesta", url: appUrl(`/portal/leads/${leadId}`) }],
  });
  await Promise.all(recipients.map((to) => sendEmail({ to, subject: `La IA propone un perfil para ${lead.name}`, html, text }).catch(() => undefined)));
}

export interface SuggestionView {
  id: string;
  operation: RealtyOperation;
  propertyType: RealtyPropertyType | null;
  minBudget: number | null;
  maxBudget: number;
  zoneNames: string[];
  minBedrooms: number | null;
  preferences: string[];
  moveTimeline: string | null;
  reason: string;
}

export async function listPendingSuggestions(organizationId: string, leadId: string): Promise<SuggestionView[]> {
  const rows = await prisma.realtyProfileSuggestion.findMany({ where: { organizationId, leadId, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 2 });
  return rows.map((r) => ({
    id: r.id,
    operation: r.operation,
    propertyType: r.propertyType,
    minBudget: r.minBudget === null ? null : Number(r.minBudget),
    maxBudget: Number(r.maxBudget),
    zoneNames: r.zoneNames,
    minBedrooms: r.minBedrooms,
    preferences: r.preferences,
    moveTimeline: r.moveTimeline,
    reason: r.reason,
  }));
}

async function pendingOf(organizationId: string, id: string) {
  const s = await prisma.realtyProfileSuggestion.findFirst({ where: { id, organizationId } });
  if (!s) throw new UserError("Sugerencia no encontrada");
  if (s.status !== "PENDING") throw new UserError("Esta sugerencia ya fue resuelta");
  return s;
}

/** Una persona acepta tal cual: se crea el perfil ligado al contacto, con las zonas que sí existen. */
export async function acceptProfileSuggestion(organizationId: string, id: string, userId: string, currency: string): Promise<string> {
  const s = await pendingOf(organizationId, id);
  const zones = await prisma.realtyZone.findMany({ where: { organizationId }, select: { id: true, name: true, key: true } });
  const { zoneIds } = matchZones(s.zoneNames, zones);
  const profileId = await saveProspect(organizationId, userId, {
    contact: { leadId: s.leadId, name: "", phone: null, email: null, source: "ai" },
    operation: s.operation,
    propertyType: s.propertyType,
    minBudget: s.minBudget === null ? null : Number(s.minBudget),
    maxBudget: Number(s.maxBudget),
    currency,
    minBedrooms: s.minBedrooms,
    minBathrooms: null,
    minArea: null,
    moveTimeline: s.moveTimeline,
    financingNeeded: null,
    preferences: s.preferences,
    zoneIds,
    branchId: null,
    advisorUserId: userId,
    active: true,
    source: "ai:conversation",
  });
  await resolveSuggestion(organizationId, s.id, "ACCEPTED", userId, profileId);
  return profileId;
}

export async function rejectProfileSuggestion(organizationId: string, id: string, userId: string) {
  const s = await pendingOf(organizationId, id);
  await resolveSuggestion(organizationId, s.id, "REJECTED", userId, null);
}

async function resolveSuggestion(organizationId: string, id: string, status: "ACCEPTED" | "REJECTED", userId: string, profileId: string | null) {
  await prisma.realtyProfileSuggestion.updateMany({ where: { id, organizationId, status: "PENDING" }, data: { status, resolvedById: userId, resolvedAt: new Date(), profileId } });
  await logAudit({ organizationId, userId, action: `realty.profile_suggestion.${status.toLowerCase()}`, resource: "RealtyProfileSuggestion", resourceId: id, metadata: { profileId } });
}
