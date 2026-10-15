// Lecturas de REYMEN Loyalty (solo servidor). Todo lo que alimenta Analytics
// y el mapa llega ya agregado desde Postgres (GROUP BY por día / por código
// postal), sin una consulta por cliente. La única lectura "por miembro" son
// columnas compactas para segmentar (MemberLite), pensada para el tamaño de un
// negocio (miles de miembros); si un programa crece a decenas de miles, esa
// parte se mueve a una vista materializada sin cambiar las pantallas.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BranchFilter } from "@/lib/branches";
import { averageTicket, progressOf, roundMoney } from "./cycle";
import { MAIN_LOCATION_KEY } from "./locations-shared";
import { activityCutoffs, activityStatus, buildInsights, pctOf, segmentCounts, summarizeZones, type MemberLite, type ZoneRow } from "./metrics";
import type { Period } from "./period";
import { trendPct } from "./period";
import { maskPhone } from "./token";

function visitBranchSql(branch: BranchFilter, alias = "v"): Prisma.Sql {
  if (branch === undefined) return Prisma.empty;
  const col = Prisma.raw(`"${alias}"."branchId"`);
  return branch === null ? Prisma.sql` AND ${col} IS NULL` : Prisma.sql` AND ${col} = ${branch}`;
}

function memberBranchSql(branch: BranchFilter): Prisma.Sql {
  if (branch === undefined) return Prisma.empty;
  return branch === null ? Prisma.sql` AND m."enrollmentBranchId" IS NULL` : Prisma.sql` AND m."enrollmentBranchId" = ${branch}`;
}

function memberBranchWhere(branch: BranchFilter): Prisma.LoyaltyMemberWhereInput {
  return branch === undefined ? {} : { enrollmentBranchId: branch };
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export interface DailyPoint {
  day: string;
  newMembers: number;
  visits: number;
  sales: number;
  rewardsEarned: number;
  rewardsRedeemed: number;
}

export interface LoyaltyAnalytics {
  kpis: {
    totalMembers: number;
    newMembers: number;
    newMembersTrend: number | null;
    visits: number;
    visitsTrend: number | null;
    loyaltySales: number;
    loyaltySalesTrend: number | null;
    avgTicket: number;
    avgTicketTrend: number | null;
    rewardsAvailable: number;
    rewardsEarned: number;
    rewardsRedeemed: number;
    /** Canjeadas ÷ obtenidas, de toda la historia del programa (no del periodo). */
    redemptionRate: number | null;
    /** Visitas promedio por cliente con al menos una visita en el periodo. */
    visitsPerActiveMember: number;
    restaurantSales: number;
    loyaltyShare: number | null;
  };
  series: DailyPoint[];
  zones: ReturnType<typeof summarizeZones>;
  segments: ReturnType<typeof segmentCounts>;
  insights: ReturnType<typeof buildInsights>;
}

export async function getLoyaltyAnalytics(args: {
  organizationId: string;
  programId: string;
  goal: number;
  period: Period;
  branch: BranchFilter;
  timezone: string;
  now?: Date;
}): Promise<LoyaltyAnalytics> {
  const { organizationId: org, programId, period, branch, timezone: tz } = args;
  const now = args.now ?? new Date();
  const vb = visitBranchSql(branch);
  const memberWhere: Prisma.LoyaltyMemberWhereInput = { organizationId: org, programId, ...memberBranchWhere(branch) };

  const visitAgg = (from: Date, to: Date) => prisma.$queryRaw<{ visits: bigint; sales: Prisma.Decimal | null; with_amount: bigint; members: bigint }[]>`
    SELECT COUNT(*) AS visits, SUM(v."saleAmount") AS sales, COUNT(v."saleAmount") AS with_amount, COUNT(DISTINCT v."memberId") AS members
    FROM "LoyaltyVisit" v
    WHERE v."organizationId" = ${org} AND v."programId" = ${programId} AND v."status" = 'CONFIRMED'
      AND v."occurredAt" >= ${from} AND v."occurredAt" < ${to}${vb}`;

  const restaurantSalesAgg = (from: Date, to: Date) =>
    prisma.foodSale.aggregate({
      where: { organizationId: org, occurredAt: { gte: from, lt: to }, ...(branch === undefined ? {} : { branchId: branch }) },
      _sum: { grossAmount: true },
    });

  const [cur, prev, totalMembers, newMembers, prevNewMembers, rewardsNow, earnedAll, redeemedAll, earnedPeriod, redeemedPeriod, restaurant] =
    await Promise.all([
      visitAgg(period.from, period.to),
      visitAgg(period.prevFrom, period.prevTo),
      prisma.loyaltyMember.count({ where: memberWhere }),
      prisma.loyaltyMember.count({ where: { ...memberWhere, createdAt: { gte: period.from, lt: period.to } } }),
      prisma.loyaltyMember.count({ where: { ...memberWhere, createdAt: { gte: period.prevFrom, lt: period.prevTo } } }),
      prisma.loyaltyReward.count({ where: { organizationId: org, programId, status: "AVAILABLE", member: memberBranchWhere(branch) } }),
      prisma.loyaltyReward.count({ where: { organizationId: org, programId, status: { not: "VOIDED" }, member: memberBranchWhere(branch) } }),
      prisma.loyaltyReward.count({ where: { organizationId: org, programId, status: "REDEEMED", member: memberBranchWhere(branch) } }),
      prisma.loyaltyReward.count({
        where: { organizationId: org, programId, status: { not: "VOIDED" }, earnedAt: { gte: period.from, lt: period.to }, ...(branch === undefined ? {} : { earnedVisit: { branchId: branch } }) },
      }),
      prisma.loyaltyReward.count({
        where: { organizationId: org, programId, status: "REDEEMED", redeemedAt: { gte: period.from, lt: period.to }, ...(branch === undefined ? {} : { redeemedBranchId: branch }) },
      }),
      restaurantSalesAgg(period.from, period.to),
    ]);

  const c = cur[0];
  const p = prev[0];
  const visits = num(c?.visits);
  const loyaltySales = roundMoney(num(c?.sales));
  const withAmount = num(c?.with_amount);
  const prevSales = roundMoney(num(p?.sales));
  const avgTicket = averageTicket(loyaltySales, withAmount);
  const prevAvgTicket = averageTicket(prevSales, num(p?.with_amount));
  const restaurantSales = roundMoney(num(restaurant._sum.grossAmount));
  const activeVisitors = num(c?.members);

  // ── Series diarias en la zona horaria del negocio ──
  // "Día" del negocio: el instante UTC guardado, llevado a la zona horaria de la organización.
  const localDay = (table: string, column: string) =>
    Prisma.sql`to_char((${Prisma.raw(`"${table}"."${column}"`)} AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;
  const [visitDays, memberDays, earnedDays, redeemedDays] = await Promise.all([
    prisma.$queryRaw<{ day: string; visits: bigint; sales: Prisma.Decimal | null }[]>`
      SELECT ${localDay("v", "occurredAt")} AS day, COUNT(*) AS visits, SUM(v."saleAmount") AS sales
      FROM "LoyaltyVisit" v
      WHERE v."organizationId" = ${org} AND v."programId" = ${programId} AND v."status" = 'CONFIRMED'
        AND v."occurredAt" >= ${period.from} AND v."occurredAt" < ${period.to}${vb}
      GROUP BY 1`,
    prisma.$queryRaw<{ day: string; n: bigint }[]>`
      SELECT ${localDay("m", "createdAt")} AS day, COUNT(*) AS n
      FROM "LoyaltyMember" m
      WHERE m."organizationId" = ${org} AND m."programId" = ${programId}
        AND m."createdAt" >= ${period.from} AND m."createdAt" < ${period.to}${memberBranchSql(branch)}
      GROUP BY 1`,
    prisma.$queryRaw<{ day: string; n: bigint }[]>`
      SELECT ${localDay("r", "earnedAt")} AS day, COUNT(*) AS n
      FROM "LoyaltyReward" r
      LEFT JOIN "LoyaltyVisit" v ON v."id" = r."earnedVisitId"
      WHERE r."organizationId" = ${org} AND r."programId" = ${programId} AND r."status" <> 'VOIDED'
        AND r."earnedAt" >= ${period.from} AND r."earnedAt" < ${period.to}${vb}
      GROUP BY 1`,
    prisma.$queryRaw<{ day: string; n: bigint }[]>`
      SELECT ${localDay("r", "redeemedAt")} AS day, COUNT(*) AS n
      FROM "LoyaltyReward" r
      WHERE r."organizationId" = ${org} AND r."programId" = ${programId} AND r."status" = 'REDEEMED'
        AND r."redeemedAt" >= ${period.from} AND r."redeemedAt" < ${period.to}
        ${branch === undefined ? Prisma.empty : branch === null ? Prisma.sql`AND r."redeemedBranchId" IS NULL` : Prisma.sql`AND r."redeemedBranchId" = ${branch}`}
      GROUP BY 1`,
  ]);
  const byDay = <T extends { day: string }>(rows: T[]) => new Map(rows.map((r) => [r.day, r]));
  const vd = byDay(visitDays);
  const md = byDay(memberDays);
  const ed = byDay(earnedDays);
  const rd = byDay(redeemedDays);
  const series: DailyPoint[] = period.days.map((day) => ({
    day,
    newMembers: num(md.get(day)?.n),
    visits: num(vd.get(day)?.visits),
    sales: roundMoney(num(vd.get(day)?.sales)),
    rewardsEarned: num(ed.get(day)?.n),
    rewardsRedeemed: num(rd.get(day)?.n),
  }));

  // ── Zonas (código postal) ──
  const [memberZones, visitZones, prevVisitZones] = await Promise.all([
    prisma.loyaltyMember.groupBy({ by: ["postalCode"], where: memberWhere, _count: { _all: true } }),
    prisma.$queryRaw<{ postal_code: string; visits: bigint; sales: Prisma.Decimal | null; with_amount: bigint }[]>`
      SELECT m."postalCode" AS postal_code, COUNT(*) AS visits, SUM(v."saleAmount") AS sales, COUNT(v."saleAmount") AS with_amount
      FROM "LoyaltyVisit" v JOIN "LoyaltyMember" m ON m."id" = v."memberId"
      WHERE v."organizationId" = ${org} AND v."programId" = ${programId} AND v."status" = 'CONFIRMED'
        AND v."occurredAt" >= ${period.from} AND v."occurredAt" < ${period.to}${vb}
      GROUP BY m."postalCode"`,
    prisma.$queryRaw<{ postal_code: string; visits: bigint }[]>`
      SELECT m."postalCode" AS postal_code, COUNT(*) AS visits
      FROM "LoyaltyVisit" v JOIN "LoyaltyMember" m ON m."id" = v."memberId"
      WHERE v."organizationId" = ${org} AND v."programId" = ${programId} AND v."status" = 'CONFIRMED'
        AND v."occurredAt" >= ${period.prevFrom} AND v."occurredAt" < ${period.prevTo}${vb}
      GROUP BY m."postalCode"`,
  ]);
  const zoneMap = new Map<string, ZoneRow>();
  const zoneOf = (cp: string) => {
    let z = zoneMap.get(cp);
    if (!z) {
      z = { postalCode: cp, members: 0, visits: 0, visitsWithAmount: 0, sales: 0, prevVisits: 0 };
      zoneMap.set(cp, z);
    }
    return z;
  };
  for (const r of memberZones) zoneOf(r.postalCode).members = r._count._all;
  for (const r of visitZones) {
    const z = zoneOf(r.postal_code);
    z.visits = num(r.visits);
    z.sales = roundMoney(num(r.sales));
    z.visitsWithAmount = num(r.with_amount);
  }
  for (const r of prevVisitZones) zoneOf(r.postal_code).prevVisits = num(r.visits);
  // Distancias: al punto de venta ubicado más cercano (solo los del filtro de sucursal).
  const locationRows = await prisma.loyaltyLocation.findMany({
    where: { organizationId: org, ...(branch === undefined ? {} : { branchKey: branch ?? MAIN_LOCATION_KEY }) },
    select: { latitude: true, longitude: true },
  });
  const zones = summarizeZones(
    [...zoneMap.values()],
    locationRows.map((l) => ({ lat: l.latitude, lng: l.longitude }))
  );

  // ── Segmentos (columnas compactas por miembro) ──
  const lites = await getMemberLites(org, programId, branch);
  const segments = segmentCounts(lites, { goal: args.goal, newSince: period.from, now });
  const insights = buildInsights({ summary: zones, segments, availableRewards: rewardsNow });

  return {
    kpis: {
      totalMembers,
      newMembers,
      newMembersTrend: trendPct(newMembers, prevNewMembers),
      visits,
      visitsTrend: trendPct(visits, num(p?.visits)),
      loyaltySales,
      loyaltySalesTrend: trendPct(loyaltySales, prevSales),
      avgTicket,
      avgTicketTrend: trendPct(avgTicket, prevAvgTicket),
      rewardsAvailable: rewardsNow,
      rewardsEarned: earnedPeriod,
      rewardsRedeemed: redeemedPeriod,
      redemptionRate: pctOf(redeemedAll, earnedAll),
      visitsPerActiveMember: activeVisitors > 0 ? Math.round((visits / activeVisitors) * 100) / 100 : 0,
      restaurantSales,
      loyaltyShare: pctOf(loyaltySales, restaurantSales),
    },
    series,
    zones,
    segments,
    insights,
  };
}

async function getMemberLites(organizationId: string, programId: string, branch: BranchFilter): Promise<MemberLite[]> {
  const [members, rewards] = await Promise.all([
    prisma.loyaltyMember.findMany({
      where: { organizationId, programId, ...memberBranchWhere(branch) },
      select: { id: true, postalCode: true, cycleVisits: true, totalVisits: true, visitsWithAmount: true, totalSpent: true, lastVisitAt: true, createdAt: true },
    }),
    prisma.loyaltyReward.groupBy({ by: ["memberId"], where: { organizationId, programId, status: "AVAILABLE" }, _count: { _all: true } }),
  ]);
  const available = new Map(rewards.map((r) => [r.memberId, r._count._all]));
  return members.map((m) => ({ ...m, totalSpent: Number(m.totalSpent), availableRewards: available.get(m.id) ?? 0 }));
}

// ─── Tabla de clientes ──────────────────────────────────────────────────

export type MemberStatusFilter = "active" | "at_risk" | "inactive";
export type MemberProgressFilter = "one_away" | "near";
export type MemberSort = "recent_visit" | "visits" | "spent" | "newest";

export interface MemberListFilters {
  q?: string;
  postalCode?: string;
  status?: MemberStatusFilter;
  rewardAvailable?: boolean;
  progress?: MemberProgressFilter;
  branch?: BranchFilter;
  sort?: MemberSort;
  page?: number;
}

export const MEMBERS_PAGE_SIZE = 25;

export async function listMembers(organizationId: string, programId: string, goal: number, f: MemberListFilters, now: Date = new Date()) {
  const where: Prisma.LoyaltyMemberWhereInput = { organizationId, programId, ...memberBranchWhere(f.branch) };
  const and: Prisma.LoyaltyMemberWhereInput[] = [];
  const q = f.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, "");
    const or: Prisma.LoyaltyMemberWhereInput[] = [{ name: { contains: q, mode: "insensitive" } }];
    if (digits.length >= 4) or.push({ whatsappKey: { contains: digits.slice(-10) } });
    if (digits.length === 5) or.push({ postalCode: digits });
    and.push({ OR: or });
  }
  if (f.postalCode) and.push({ postalCode: f.postalCode });
  if (f.status) {
    const { activeAfter, riskAfter } = activityCutoffs(now);
    const range =
      f.status === "active" ? { gt: activeAfter } : f.status === "at_risk" ? { gt: riskAfter, lte: activeAfter } : { lte: riskAfter };
    and.push({ OR: [{ lastVisitAt: range }, { lastVisitAt: null, createdAt: range }] });
  }
  if (f.rewardAvailable) and.push({ rewards: { some: { status: "AVAILABLE" } } });
  if (f.progress === "one_away") and.push({ cycleVisits: Math.max(0, goal - 1) });
  if (f.progress === "near") and.push({ cycleVisits: { gte: Math.ceil(goal * 0.7) } });
  if (and.length) where.AND = and;

  const orderBy: Prisma.LoyaltyMemberOrderByWithRelationInput[] =
    f.sort === "visits"
      ? [{ totalVisits: "desc" }, { name: "asc" }]
      : f.sort === "spent"
        ? [{ totalSpent: "desc" }, { name: "asc" }]
        : f.sort === "newest"
          ? [{ createdAt: "desc" }]
          : [{ lastVisitAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }];
  const page = Math.max(1, f.page ?? 1);

  const [total, rows] = await Promise.all([
    prisma.loyaltyMember.count({ where }),
    prisma.loyaltyMember.findMany({
      where,
      orderBy,
      skip: (page - 1) * MEMBERS_PAGE_SIZE,
      take: MEMBERS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        whatsapp: true,
        postalCode: true,
        cycleVisits: true,
        totalVisits: true,
        visitsWithAmount: true,
        totalSpent: true,
        lastVisitAt: true,
        createdAt: true,
        enrollmentBranch: { select: { name: true } },
        _count: { select: { rewards: { where: { status: "AVAILABLE" } } } },
      },
    }),
  ]);

  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / MEMBERS_PAGE_SIZE)),
    rows: rows.map((m) => ({
      id: m.id,
      name: m.name,
      maskedWhatsapp: maskPhone(m.whatsapp),
      postalCode: m.postalCode,
      totalVisits: m.totalVisits,
      progress: progressOf(m.cycleVisits, goal),
      totalSpent: Number(m.totalSpent),
      avgTicket: averageTicket(Number(m.totalSpent), m.visitsWithAmount),
      lastVisitAt: m.lastVisitAt,
      status: activityStatus(m.lastVisitAt, m.createdAt, now),
      availableRewards: m._count.rewards,
      enrollmentBranch: m.enrollmentBranch?.name ?? null,
    })),
  };
}

/** Códigos postales con miembros (para el filtro de la tabla). */
export async function listMemberPostalCodes(organizationId: string, programId: string) {
  const rows = await prisma.loyaltyMember.groupBy({
    by: ["postalCode"],
    where: { organizationId, programId },
    _count: { _all: true },
    orderBy: { postalCode: "asc" },
  });
  return rows.map((r) => ({ postalCode: r.postalCode, members: r._count._all }));
}

// ─── Perfil del cliente ─────────────────────────────────────────────────

export async function getMemberProfile(organizationId: string, memberId: string, goal: number, now: Date = new Date()) {
  const m = await prisma.loyaltyMember.findFirst({
    where: { id: memberId, organizationId },
    include: {
      program: { select: { currentVersion: true, versions: { select: { version: true, visitGoal: true } } } },
      enrollmentBranch: { select: { name: true } },
      customer: { select: { lead: { select: { id: true, deletedAt: true } } } },
      rewards: {
        orderBy: { earnedAt: "desc" },
        include: { redeemedBranch: { select: { name: true } }, redeemedBy: { select: { name: true, email: true } } },
      },
      visits: {
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: { branch: { select: { name: true } }, employee: { select: { name: true, email: true } } },
      },
    },
  });
  if (!m) return null;
  const totalSpent = Number(m.totalSpent);
  return {
    id: m.id,
    name: m.name,
    whatsapp: m.whatsapp,
    email: m.email,
    postalCode: m.postalCode,
    publicToken: m.publicToken,
    leadId: m.customer?.lead && !m.customer.lead.deletedAt ? m.customer.lead.id : null,
    createdAt: m.createdAt,
    lastVisitAt: m.lastVisitAt,
    firstVisitAt: m.firstVisitAt,
    enrollmentBranch: m.enrollmentBranch?.name ?? null,
    totalVisits: m.totalVisits,
    cycleNumber: m.cycleNumber,
    deficitVisits: m.deficitVisits,
    progress: progressOf(m.cycleVisits, m.program.versions.find(v => v.version === m.program.currentVersion)?.visitGoal ?? goal),
    totalSpent,
    avgTicket: averageTicket(totalSpent, m.visitsWithAmount),
    status: activityStatus(m.lastVisitAt, m.createdAt, now),
    rewardsEarned: m.rewards.length,
    rewardsRedeemed: m.rewards.filter((r) => r.status === "REDEEMED").length,
    rewards: m.rewards.map((r) => ({
      id: r.id,
      rewardName: r.rewardName,
      status: r.status,
      cycleNumber: r.cycleNumber,
      visitGoal: r.visitGoal,
      programVersion: r.programVersion,
      earnedAt: r.earnedAt,
      redeemedAt: r.redeemedAt,
      redeemedBranch: r.redeemedBranch?.name ?? null,
      redeemedBy: r.redeemedBy?.name ?? r.redeemedBy?.email ?? null,
    })),
    visits: m.visits.map((v) => ({
      id: v.id,
      occurredAt: v.occurredAt,
      saleAmount: v.saleAmount === null ? null : Number(v.saleAmount),
      branch: v.branch?.name ?? null,
      employee: v.employee?.name ?? v.employee?.email ?? null,
      cycleNumber: v.cycleNumber,
    })),
  };
}

/** Lo que la caja necesita ver para confirmar identidad y registrar la visita. */
export async function getCheckoutMember(organizationId: string, memberId: string, goal: number) {
  const original = await prisma.loyaltyMember.findFirst({ where: { id: memberId, organizationId }, select: { customerId: true } });
  if (!original) return null;
  const m = await prisma.loyaltyMember.findFirst({
    where: { organizationId, ...(original.customerId ? { customerId: original.customerId, isSelected: true } : { id: memberId }) },
    select: {
      id: true,
      program: { select: { currentVersion: true, versions: { select: { version: true, visitGoal: true } } } },
      name: true,
      whatsapp: true,
      postalCode: true,
      cycleVisits: true,
      totalVisits: true,
      visitsWithAmount: true,
      totalSpent: true,
      lastVisitAt: true,
      rewards: { where: { status: "AVAILABLE" }, orderBy: { earnedAt: "asc" }, select: { id: true, rewardName: true, earnedAt: true } },
    },
  });
  if (!m) return null;
  return {
    id: m.id,
    name: m.name,
    maskedWhatsapp: maskPhone(m.whatsapp),
    postalCode: m.postalCode,
    progress: progressOf(m.cycleVisits, m.program.versions.find(v => v.version === m.program.currentVersion)?.visitGoal ?? goal),
    totalVisits: m.totalVisits,
    avgTicket: averageTicket(Number(m.totalSpent), m.visitsWithAmount),
    lastVisitAt: m.lastVisitAt,
    availableRewards: m.rewards,
  };
}

export type CheckoutMember = NonNullable<Awaited<ReturnType<typeof getCheckoutMember>>>;

/** Búsqueda rápida en caja por nombre o últimos dígitos del WhatsApp (sin QR a la mano). */
export async function searchMembersForCheckout(organizationId: string, _programId: string, q: string) {
  const text = q.trim();
  if (text.length < 2) return [];
  const digits = text.replace(/\D/g, "");
  const or: Prisma.LoyaltyMemberWhereInput[] = [{ name: { contains: text, mode: "insensitive" } }];
  if (digits.length >= 4) or.push({ whatsappKey: { endsWith: digits.slice(-10) } });
  const rows = await prisma.loyaltyMember.findMany({
    where: { organizationId, isSelected: true, OR: or },
    orderBy: [{ lastVisitAt: { sort: "desc", nulls: "last" } }],
    take: 8,
    select: { id: true, name: true, whatsapp: true, postalCode: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, maskedWhatsapp: maskPhone(r.whatsapp), postalCode: r.postalCode }));
}

// ─── Historial de visitas ───────────────────────────────────────────────

export async function listRecentVisits(organizationId: string, programId: string, branch: BranchFilter, take = 15) {
  const rows = await prisma.loyaltyVisit.findMany({
    where: { organizationId, programId, ...(branch === undefined ? {} : { branchId: branch }) },
    orderBy: { occurredAt: "desc" },
    take,
    include: {
      member: { select: { id: true, name: true, postalCode: true } },
      branch: { select: { name: true } },
      employee: { select: { name: true, email: true } },
      earnedReward: { select: { rewardName: true } },
    },
  });
  return rows.map((v) => ({
    id: v.id,
    occurredAt: v.occurredAt,
    memberId: v.member.id,
    memberName: v.member.name,
    postalCode: v.member.postalCode,
    saleAmount: v.saleAmount === null ? null : Number(v.saleAmount),
    branch: v.branch?.name ?? null,
    employee: v.employee?.name ?? v.employee?.email ?? null,
    rewardEarned: v.earnedReward?.rewardName ?? null,
  }));
}

export async function listRecentMembers(organizationId: string, programId: string, branch: BranchFilter, goal: number, take = 6) {
  const rows = await prisma.loyaltyMember.findMany({
    where: { organizationId, programId, ...memberBranchWhere(branch) },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, name: true, postalCode: true, createdAt: true, cycleVisits: true },
  });
  return rows.map((r) => ({ ...r, progress: progressOf(r.cycleVisits, goal) }));
}
