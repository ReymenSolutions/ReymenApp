// Solo servidor. Lecturas de REYMEN Ops Realty, siempre filtradas por la
// organización de la sesión. Los números salen de conteos en SQL y de las
// reglas puras (match.ts, market.ts, scores.ts, campaigns.ts); nada de IA.

import type { Prisma, RealtyOperation, RealtyPropertyStatus, RealtyPropertyType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPEN_STATUSES } from "./constants";
import { GOOD_MATCH, HIGH_MATCH, computeMatch, matchMissReasons, type MatchMissReason } from "./match";
import {
  budgetBands,
  emergingZones,
  operationSplit,
  sourcingOpportunities,
  topPreferences,
  typeBalances,
  zoneBalances,
  type DemandProfile,
} from "./market";
import { EMPTY_ENGAGEMENT, isBoostCandidate, isStagnant, stagnationReason, priceInsight, propertyOpportunity, zoneOpportunity, type Engagement, type PropertyScore, type ScoredProperty } from "./scores";
import { analyzeCampaigns, campaignTotals } from "./campaigns";
import { campaignCounts, countsOf } from "./campaign-stats";
import { num, toMatchProfile, toMatchProperty } from "./service";

const DAY = 86_400_000;
const SNAPSHOT_CAP = 5000;

export interface Range {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
}

// ─── Snapshot: todo lo que necesita el análisis, en 5 consultas ─────────

export async function loadSnapshot(organizationId: string, now: Date = new Date()) {
  const since30 = new Date(now.getTime() - 30 * DAY);
  const [zones, profileRows, propertyRows, eventRows, visitRows] = await Promise.all([
    prisma.realtyZone.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, latitude: true, longitude: true } }),
    prisma.realtyLeadProfile.findMany({
      where: { organizationId, active: true },
      select: { id: true, operation: true, propertyType: true, minBudget: true, maxBudget: true, preferences: true, createdAt: true, zones: { select: { zoneId: true, priority: true } } },
      take: SNAPSHOT_CAP,
      orderBy: { createdAt: "desc" },
    }),
    prisma.realtyProperty.findMany({
      where: { organizationId },
      select: {
        id: true,
        title: true,
        slug: true,
        operation: true,
        propertyType: true,
        status: true,
        price: true,
        currency: true,
        zoneId: true,
        constructionArea: true,
        landArea: true,
        bedrooms: true,
        bathrooms: true,
        availableSince: true,
        publishedAt: true,
        media: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } },
      },
      take: SNAPSHOT_CAP,
      orderBy: { createdAt: "desc" },
    }),
    prisma.realtyPropertyEvent.groupBy({ by: ["propertyId", "type"], where: { organizationId, occurredAt: { gte: since30 } }, _count: { _all: true } }),
    prisma.realtyPropertyVisit.findMany({
      where: { organizationId, appointment: { startTime: { gte: since30, lte: now }, status: { notIn: ["CANCELLED", "NO_SHOW"] } } },
      select: { propertyId: true },
    }),
  ]);

  const profiles: DemandProfile[] = profileRows.map((p) => ({
    id: p.id,
    operation: p.operation,
    propertyType: p.propertyType,
    minBudget: num(p.minBudget),
    maxBudget: Number(p.maxBudget),
    zoneIds: [...p.zones].sort((a, b) => a.priority - b.priority).map((z) => z.zoneId),
    preferences: p.preferences,
    createdAt: p.createdAt,
  }));
  const properties = propertyRows.map((p) => ({
    ...p,
    price: Number(p.price),
    listedAt: p.availableSince,
    coverId: p.media[0]?.id ?? null,
  }));
  const engagement = new Map<string, Engagement>();
  for (const e of eventRows) {
    const cur = engagement.get(e.propertyId) ?? { ...EMPTY_ENGAGEMENT };
    const n = e._count._all;
    if (e.type === "VIEW") cur.views += n;
    if (e.type === "WHATSAPP_CLICK") cur.whatsapp += n;
    if (e.type === "SCHEDULE_CLICK") cur.schedule += n;
    if (e.type === "SHARE_CLICK") cur.share += n;
    engagement.set(e.propertyId, cur);
  }
  const recentVisits = new Map<string, number>();
  for (const v of visitRows) recentVisits.set(v.propertyId, (recentVisits.get(v.propertyId) ?? 0) + 1);
  return { now, zones, profiles, properties, engagement, recentVisits };
}

export type Snapshot = Awaited<ReturnType<typeof loadSnapshot>>;
export type SnapshotProperty = Snapshot["properties"][number];

/** Market Pulse + scores a partir del snapshot (puro, sin más consultas). */
export function analyze(s: Snapshot, period: { from: Date; to: Date }) {
  const scored: ScoredProperty[] = s.properties;
  const open = s.properties.filter((p) => OPEN_STATUSES.includes(p.status));
  const scores = new Map<string, PropertyScore>();
  for (const p of open) scores.set(p.id, propertyOpportunity(p, { profiles: s.profiles, properties: scored, engagement: s.engagement, now: s.now }));
  const byId = new Map(s.properties.map((p) => [p.id, p]));
  const boost = open
    .filter((p) => isBoostCandidate(p, scores.get(p.id)!))
    .sort((a, b) => scores.get(b.id)!.total - scores.get(a.id)!.total);
  const stagnant = open
    .filter((p) => isStagnant(p, scores.get(p.id)!, s.recentVisits.get(p.id) ?? 0, s.engagement.get(p.id)))
    .sort((a, b) => scores.get(b.id)!.facts.days - scores.get(a.id)!.facts.days);
  return {
    zonesAll: zoneBalances(s.zones, s.profiles, s.properties),
    zonesSale: zoneBalances(s.zones, s.profiles, s.properties, "SALE"),
    zonesRent: zoneBalances(s.zones, s.profiles, s.properties, "RENT"),
    bandsSale: budgetBands(s.profiles, s.properties, "SALE"),
    bandsRent: budgetBands(s.profiles, s.properties, "RENT"),
    split: operationSplit(s.profiles, s.properties),
    types: typeBalances(s.profiles, s.properties),
    preferences: topPreferences(s.profiles),
    emerging: emergingZones(s.zones, s.profiles, period),
    sourcing: sourcingOpportunities(s.zones, s.profiles, s.properties),
    zoneScores: zoneOpportunity(s.zones, { profiles: s.profiles, properties: scored, engagement: s.engagement, period }),
    scores,
    boost,
    stagnant,
    byId,
    stagnationFor: (id: string) => {
      const p = byId.get(id);
      const sc = scores.get(id);
      return p && sc ? stagnationReason(p, sc, s.recentVisits.get(id) ?? 0, s.engagement.get(id)) : null;
    },
    priceInsightFor: (id: string) => {
      const p = byId.get(id);
      return p ? priceInsight(p, scored, s.profiles) : null;
    },
  };
}

export type Analysis = ReturnType<typeof analyze>;

// ─── Resumen ────────────────────────────────────────────────────────────

export async function getDashboardCounts(organizationId: string, r: Range) {
  const inRange = (from: Date, to: Date) => ({ gte: from, lt: to });
  const [newProfiles, newProfilesPrev, visits, visitsPrev, closings, closingsPrev, events, eventsPrev, highMatches, activeProfiles] = await Promise.all([
    prisma.realtyLeadProfile.count({ where: { organizationId, createdAt: inRange(r.from, r.to) } }),
    prisma.realtyLeadProfile.count({ where: { organizationId, createdAt: inRange(r.prevFrom, r.prevTo) } }),
    prisma.realtyPropertyVisit.count({ where: { organizationId, appointment: { startTime: inRange(r.from, r.to), status: { not: "CANCELLED" } } } }),
    prisma.realtyPropertyVisit.count({ where: { organizationId, appointment: { startTime: inRange(r.prevFrom, r.prevTo), status: { not: "CANCELLED" } } } }),
    prisma.realtyClosing.aggregate({ where: { organizationId, closedAt: inRange(r.from, r.to) }, _count: { _all: true }, _sum: { finalAmount: true, commissionAmount: true } }),
    prisma.realtyClosing.count({ where: { organizationId, closedAt: inRange(r.prevFrom, r.prevTo) } }),
    prisma.realtyPropertyEvent.groupBy({ by: ["type"], where: { organizationId, occurredAt: inRange(r.from, r.to) }, _count: { _all: true } }),
    prisma.realtyPropertyEvent.groupBy({ by: ["type"], where: { organizationId, occurredAt: inRange(r.prevFrom, r.prevTo) }, _count: { _all: true } }),
    prisma.realtyMatch.count({ where: { organizationId, totalScore: { gte: HIGH_MATCH }, profile: { active: true }, property: { status: { in: OPEN_STATUSES } } } }),
    prisma.realtyLeadProfile.count({ where: { organizationId, active: true } }),
  ]);
  const ev = (rows: typeof events, t: string) => rows.find((x) => x.type === t)?._count._all ?? 0;
  // Embudo del periodo: prospectos nuevos → con buen match → con visita → con cierre.
  const [withMatch, withVisit, withClosing] = await Promise.all([
    prisma.realtyLeadProfile.count({ where: { organizationId, createdAt: inRange(r.from, r.to), matches: { some: { totalScore: { gte: GOOD_MATCH } } } } }),
    prisma.realtyLeadProfile.count({ where: { organizationId, createdAt: inRange(r.from, r.to), visits: { some: { appointment: { status: { not: "CANCELLED" } } } } } }),
    prisma.realtyLeadProfile.count({ where: { organizationId, createdAt: inRange(r.from, r.to), closings: { some: {} } } }),
  ]);
  const clicks = (rows: typeof events) => ev(rows, "WHATSAPP_CLICK") + ev(rows, "SCHEDULE_CLICK");
  return {
    activeProfiles,
    newProfiles,
    newProfilesPrev,
    visits,
    visitsPrev,
    closings: closings._count._all,
    closingsPrev,
    closedAmount: Number(closings._sum.finalAmount ?? 0),
    commission: Number(closings._sum.commissionAmount ?? 0),
    views: ev(events, "VIEW"),
    viewsPrev: ev(eventsPrev, "VIEW"),
    contacts: clicks(events),
    contactsPrev: clicks(eventsPrev),
    highMatches,
    funnel: [newProfiles, withMatch, withVisit, withClosing] as const,
  };
}

export async function listUpcomingVisits(organizationId: string, now: Date, days = 7, take = 6) {
  return prisma.realtyPropertyVisit.findMany({
    where: { organizationId, appointment: { startTime: { gte: now, lt: new Date(now.getTime() + days * DAY) }, status: { in: ["SCHEDULED", "CONFIRMED"] } } },
    orderBy: { appointment: { startTime: "asc" } },
    take,
    select: {
      id: true,
      appointment: { select: { id: true, startTime: true, endTime: true, status: true } },
      property: { select: { id: true, title: true, zone: { select: { name: true } } } },
      profile: { select: { id: true, lead: { select: { name: true } } } },
    },
  });
}

/** Insumos de "Qué hacer hoy" que no están en el snapshot. */
export async function getTodayInputs(organizationId: string, now: Date) {
  const [highMatches, campaigns, recentProfiles] = await Promise.all([
    prisma.realtyMatch.findMany({
      where: { organizationId, totalScore: { gte: HIGH_MATCH }, profile: { active: true }, property: { status: "AVAILABLE" } },
      orderBy: { totalScore: "desc" },
      take: 12,
      select: {
        totalScore: true,
        profile: { select: { id: true, lead: { select: { name: true } } } },
        property: { select: { id: true, title: true } },
        profileId: true,
        propertyId: true,
      },
    }),
    prisma.realtyCampaign.findMany({ where: { organizationId, status: "ACTIVE" }, select: { id: true, name: true, spend: true } }),
    prisma.realtyLeadProfile.findMany({
      where: { organizationId, active: true, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
      select: { id: true, lead: { select: { name: true } }, matches: { orderBy: { totalScore: "desc" }, take: 1, select: { totalScore: true } } },
      take: 200,
    }),
  ]);
  const counts = await campaignCounts(organizationId);
  const pairs = await prisma.realtyPropertyVisit.findMany({
    where: { organizationId, OR: highMatches.map((m) => ({ profileId: m.profileId, propertyId: m.propertyId })) },
    select: { profileId: true, propertyId: true },
  });
  const visited = new Set(pairs.map((p) => `${p.profileId}|${p.propertyId}`));
  return {
    highMatches: highMatches.map((m) => ({
      profileId: m.profileId,
      profileName: m.profile.lead?.name ?? "Prospecto",
      propertyId: m.propertyId,
      propertyTitle: m.property.title,
      score: m.totalScore,
      hasVisit: visited.has(`${m.profileId}|${m.propertyId}`),
    })),
    campaigns: campaigns.map((c) => {
      const k = countsOf(counts, c.id);
      return { ...c, spend: Number(c.spend), leadsCount: k.leads, visitsCount: k.visits, closingsCount: k.closings, attributedRevenue: k.closings > 0 ? k.revenue : null };
    }),
    unmatched: recentProfiles
      .filter((p) => (p.matches[0]?.totalScore ?? 0) < GOOD_MATCH)
      .map((p) => ({ profileId: p.id, name: p.lead?.name ?? "Prospecto", bestScore: p.matches[0]?.totalScore ?? null })),
  };
}

// ─── Listas y detalles ──────────────────────────────────────────────────

export async function listAdvisors(organizationId: string) {
  return prisma.user.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } });
}

export async function listZones(organizationId: string) {
  return prisma.realtyZone.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, key: true, postalCode: true, latitude: true, longitude: true, _count: { select: { properties: true, leadZones: true } } },
  });
}

export async function getSettings(organizationId: string) {
  return prisma.realtySettings.findUnique({ where: { organizationId } });
}

export interface ProspectFilters {
  q?: string;
  operation?: RealtyOperation;
  zoneId?: string;
  status?: "active" | "inactive" | "all";
}

export async function listProspects(organizationId: string, f: ProspectFilters, paging: { page: number; pageSize: number } = { page: 1, pageSize: 100 }) {
  const q = f.q?.trim();
  const where: Prisma.RealtyLeadProfileWhereInput = {
      organizationId,
      ...(f.status === "all" ? {} : { active: f.status !== "inactive" }),
      ...(f.operation ? { operation: f.operation } : {}),
      ...(f.zoneId ? { zones: { some: { zoneId: f.zoneId } } } : {}),
      ...(q ? { lead: { OR: [{ name: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] } } : {}),
  };
  const [total, rows] = await Promise.all([prisma.realtyLeadProfile.count({ where }), prisma.realtyLeadProfile.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    skip: (paging.page - 1) * paging.pageSize,
    take: paging.pageSize,
    select: {
      id: true,
      operation: true,
      propertyType: true,
      minBudget: true,
      maxBudget: true,
      currency: true,
      active: true,
      source: true,
      createdAt: true,
      preferences: true,
      lead: { select: { id: true, name: true, phone: true, status: true } },
      advisor: { select: { name: true } },
      zones: { orderBy: { priority: "asc" }, select: { zone: { select: { name: true } } } },
      matches: { orderBy: { totalScore: "desc" }, take: 1, select: { totalScore: true } },
      _count: { select: { visits: true } },
    },
  })]);
  return { total, rows: rows.map((r) => ({ ...r, minBudget: num(r.minBudget), maxBudget: Number(r.maxBudget), bestMatch: r.matches[0]?.totalScore ?? null })) };
}

export async function getProspect(organizationId: string, id: string) {
  const p = await prisma.realtyLeadProfile.findFirst({
    where: { id, organizationId },
    include: {
      lead: { select: { id: true, name: true, phone: true, email: true, status: true } },
      advisor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      zones: { orderBy: { priority: "asc" }, select: { zoneId: true, priority: true, zone: { select: { name: true } } } },
      matches: {
        orderBy: { totalScore: "desc" },
        take: 30,
        include: { property: { select: { id: true, title: true, price: true, currency: true, status: true, operation: true, zone: { select: { name: true } }, media: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } } } } },
      },
      visits: {
        orderBy: { appointment: { startTime: "desc" } },
        select: { id: true, outcome: true, appointment: { select: { startTime: true, status: true } }, property: { select: { id: true, title: true } } },
      },
      closings: { select: { id: true, closedAt: true, finalAmount: true, property: { select: { title: true } } } },
    },
  });
  if (!p) return null;
  return { ...p, minBudget: num(p.minBudget), maxBudget: Number(p.maxBudget) };
}

export interface MatchDiagnosis {
  property: { id: string; title: string; price: number; currency: string; zoneName: string };
  visited: boolean;
  total: number;
  reasons: MatchMissReason[];
}

/**
 * Las propiedades abiertas más cercanas a lo que busca el prospecto que NO
 * son match, con el porqué. Primero las que ya visitó. Para que el asesor
 * entienda por qué el tablero no le muestra nada (p. ej. busca renta y la
 * propiedad es de venta) en lugar de pensar que el match falló.
 */
export async function getMatchDiagnosis(organizationId: string, profileId: string, limit = 3): Promise<MatchDiagnosis[]> {
  const profile = await prisma.realtyLeadProfile.findFirst({
    where: { id: profileId, organizationId },
    include: {
      zones: { select: { zoneId: true, priority: true } },
      matches: { select: { propertyId: true } },
      visits: { select: { propertyId: true } },
    },
  });
  if (!profile) return [];
  const matched = new Set(profile.matches.map((m) => m.propertyId));
  const visited = new Set(profile.visits.map((v) => v.propertyId));
  const properties = await prisma.realtyProperty.findMany({
    where: { organizationId, status: { in: OPEN_STATUSES }, id: { notIn: [...matched] } },
    select: {
      id: true, title: true, currency: true, operation: true, propertyType: true, price: true, zoneId: true,
      bedrooms: true, bathrooms: true, constructionArea: true, landArea: true, features: true,
      zone: { select: { name: true } },
    },
    take: 300,
  });
  const mp = toMatchProfile(profile);
  return properties
    .map((p) => {
      const prop = toMatchProperty(p);
      const m = computeMatch(mp, prop);
      return {
        property: { id: p.id, title: p.title, price: Number(p.price), currency: p.currency, zoneName: p.zone.name },
        visited: visited.has(p.id),
        total: m.total,
        reasons: matchMissReasons(mp, prop, m),
      };
    })
    .sort((a, b) => Number(b.visited) - Number(a.visited) || b.total - a.total)
    .slice(0, limit);
}

export interface PropertyFilters {
  q?: string;
  status?: RealtyPropertyStatus | "open";
  operation?: RealtyOperation;
  zoneId?: string;
  type?: RealtyPropertyType;
}

export async function listProperties(organizationId: string, f: PropertyFilters, paging: { page: number; pageSize: number } = { page: 1, pageSize: 120 }) {
  const q = f.q?.trim();
  const where: Prisma.RealtyPropertyWhereInput = {
      organizationId,
      ...(f.status === "open" ? { status: { in: OPEN_STATUSES } } : f.status ? { status: f.status } : {}),
      ...(f.operation ? { operation: f.operation } : {}),
      ...(f.zoneId ? { zoneId: f.zoneId } : {}),
      ...(f.type ? { propertyType: f.type } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { neighborhood: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, rows] = await Promise.all([prisma.realtyProperty.count({ where }), prisma.realtyProperty.findMany({
    where,
    orderBy: [{ status: "asc" }, { availableSince: "desc" }, { id: "asc" }],
    skip: (paging.page - 1) * paging.pageSize,
    take: paging.pageSize,
    select: {
      id: true,
      slug: true,
      title: true,
      operation: true,
      propertyType: true,
      status: true,
      price: true,
      currency: true,
      bedrooms: true,
      bathrooms: true,
      constructionArea: true,
      landArea: true,
      neighborhood: true,
      publishedAt: true,
      availableSince: true,
      isDemo: true,
      zone: { select: { id: true, name: true } },
      advisor: { select: { name: true } },
      media: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } },
      _count: { select: { matches: { where: { totalScore: { gte: GOOD_MATCH } } }, visits: true } },
    },
  })]);
  return { total, rows: rows.map((r) => ({ ...r, price: Number(r.price), coverId: r.media[0]?.id ?? null })) };
}

export async function getProperty(organizationId: string, id: string, now: Date = new Date()) {
  const p = await prisma.realtyProperty.findFirst({
    where: { id, organizationId },
    include: {
      zone: { select: { id: true, name: true } },
      advisor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      media: { orderBy: { sortOrder: "asc" }, select: { id: true, width: true, height: true, sortOrder: true } },
      statusHistory: { orderBy: { changedAt: "desc" }, take: 20 },
      matches: { orderBy: { totalScore: "desc" }, take: 20, include: { profile: { select: { id: true, active: true, maxBudget: true, lead: { select: { name: true } } } } } },
      visits: { orderBy: { appointment: { startTime: "desc" } }, take: 20, select: { id: true, outcome: true, appointment: { select: { startTime: true, status: true } }, profile: { select: { id: true, lead: { select: { name: true } } } } } },
      closings: { select: { id: true, closedAt: true, finalAmount: true, commissionAmount: true } },
      campaigns: { select: { id: true, name: true, channel: true, status: true } },
    },
  });
  if (!p) return null;
  const since30 = new Date(now.getTime() - 30 * DAY);
  const [byType, bySource] = await Promise.all([
    prisma.realtyPropertyEvent.groupBy({ by: ["type"], where: { organizationId, propertyId: id, occurredAt: { gte: since30 } }, _count: { _all: true } }),
    prisma.realtyPropertyEvent.groupBy({ by: ["source"], where: { organizationId, propertyId: id, occurredAt: { gte: since30 } }, _count: { _all: true } }),
  ]);
  const userIds = [...new Set(p.statusHistory.map((h) => h.changedById).filter((x): x is string => !!x))];
  const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds }, organizationId }, select: { id: true, name: true } }) : [];
  const names = new Map(users.map((u) => [u.id, u.name]));
  return {
    ...p,
    price: Number(p.price),
    statusHistory: p.statusHistory.map((h) => ({ ...h, changedByName: h.changedById ? (names.get(h.changedById) ?? null) : null })),
    events: Object.fromEntries(byType.map((e) => [e.type, e._count._all])) as Partial<Record<"VIEW" | "WHATSAPP_CLICK" | "SCHEDULE_CLICK" | "SHARE_CLICK" | "INQUIRY", number>>,
    sources: bySource.map((s) => ({ source: s.source ?? "direct", count: s._count._all })).sort((a, b) => b.count - a.count),
  };
}

export async function listVisits(organizationId: string, opts: { from: Date; to: Date }) {
  return prisma.realtyPropertyVisit.findMany({
    where: { organizationId, appointment: { startTime: { gte: opts.from, lt: opts.to } } },
    orderBy: { appointment: { startTime: "asc" } },
    take: 300,
    select: {
      id: true,
      outcome: true,
      advisorUserId: true,
      appointment: { select: { id: true, startTime: true, endTime: true, status: true } },
      property: { select: { id: true, title: true, zone: { select: { name: true } } } },
      profile: { select: { id: true, lead: { select: { name: true, phone: true } } } },
    },
  });
}

export async function listCampaigns(organizationId: string) {
  const rows = await prisma.realtyCampaign.findMany({
    where: { organizationId },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    include: { property: { select: { id: true, title: true, slug: true } } },
  });
  const counts = await campaignCounts(organizationId);
  const data = rows.map((c) => {
    const k = countsOf(counts, c.id);
    return { ...c, spend: Number(c.spend), leadsCount: k.leads, visitsCount: k.visits, closingsCount: k.closings, attributedRevenue: k.closings > 0 ? k.revenue : null };
  });
  const analysis = analyzeCampaigns(data);
  return { rows: data.map((c, i) => ({ ...c, metrics: analysis[i].metrics, rating: analysis[i].rating })), totals: campaignTotals(data) };
}

export async function listOpenPropertiesForSelect(organizationId: string) {
  return prisma.realtyProperty.findMany({ where: { organizationId, status: { in: OPEN_STATUSES } }, orderBy: { title: "asc" }, select: { id: true, title: true, operation: true, price: true, zone: { select: { name: true } } } });
}

export async function listActiveProspectsForSelect(organizationId: string) {
  return prisma.realtyLeadProfile.findMany({ where: { organizationId, active: true }, orderBy: { createdAt: "desc" }, take: 300, select: { id: true, operation: true, lead: { select: { name: true, phone: true } } } });
}

// ─── Reportes ───────────────────────────────────────────────────────────

export async function getReports(organizationId: string, r: Range) {
  const [closings, visits, advisors, zones] = await Promise.all([
    prisma.realtyClosing.findMany({
      where: { organizationId, closedAt: { gte: r.from, lt: r.to } },
      select: { id: true, operation: true, finalAmount: true, commissionAmount: true, closedAt: true, advisorUserId: true, property: { select: { title: true, zoneId: true, availableSince: true, zone: { select: { name: true } } } } },
      orderBy: { closedAt: "desc" },
    }),
    prisma.realtyPropertyVisit.findMany({ where: { organizationId, appointment: { startTime: { gte: r.from, lt: r.to }, status: { not: "CANCELLED" } } }, select: { advisorUserId: true, property: { select: { zoneId: true } } } }),
    listAdvisors(organizationId),
    prisma.realtyZone.findMany({ where: { organizationId }, select: { id: true, name: true } }),
  ]);
  const advisorName = new Map(advisors.map((a) => [a.id, a.name ?? a.email]));
  const byAdvisor = new Map<string, { name: string; visits: number; closings: number; amount: number; commission: number }>();
  const ensureA = (id: string | null) => {
    const k = id ?? "none";
    if (!byAdvisor.has(k)) byAdvisor.set(k, { name: id ? (advisorName.get(id) ?? "—") : "Sin asesor", visits: 0, closings: 0, amount: 0, commission: 0 });
    return byAdvisor.get(k)!;
  };
  for (const v of visits) ensureA(v.advisorUserId).visits++;
  const byZone = new Map<string, { name: string; visits: number; closings: number; amount: number; days: number[] }>();
  for (const z of zones) byZone.set(z.id, { name: z.name, visits: 0, closings: 0, amount: 0, days: [] });
  for (const v of visits) {
    const z = byZone.get(v.property.zoneId);
    if (z) z.visits++;
  }
  for (const c of closings) {
    const a = ensureA(c.advisorUserId);
    a.closings++;
    a.amount += Number(c.finalAmount);
    a.commission += Number(c.commissionAmount ?? 0);
    const z = byZone.get(c.property.zoneId);
    if (z) {
      z.closings++;
      z.amount += Number(c.finalAmount);
      z.days.push(Math.max(0, Math.round((c.closedAt.getTime() - c.property.availableSince.getTime()) / DAY)));
    }
  }
  return {
    closings: closings.map((c) => ({ ...c, finalAmount: Number(c.finalAmount), commissionAmount: num(c.commissionAmount), advisorName: c.advisorUserId ? (advisorName.get(c.advisorUserId) ?? "—") : "—" })),
    byAdvisor: [...byAdvisor.values()].sort((a, b) => b.amount - a.amount || b.visits - a.visits),
    byZone: [...byZone.values()]
      .filter((z) => z.visits || z.closings)
      .map((z) => ({ ...z, avgDaysToClose: z.days.length ? Math.round(z.days.reduce((a, b) => a + b, 0) / z.days.length) : null }))
      .sort((a, b) => b.amount - a.amount || b.visits - a.visits),
  };
}
