// Solo servidor. Insumos del reporte de rotación: propiedades cerradas en el
// periodo (con su fecha real de cierre), inventario abierto, interés recibido
// y prospectos cuya mejor propiedad no llega a ser un buen match.

import { prisma } from "@/lib/prisma";
import { CLOSED_STATUSES, OPEN_STATUSES } from "./constants";
import type { ClosedProperty, OpenProperty, UnmetProfile } from "./rotation";

const CAP = 2000;

export async function loadRotationInputs(organizationId: string, range: { from: Date; to: Date }) {
  const [zones, closedRows, openRows, profileRows] = await Promise.all([
    prisma.realtyZone.findMany({ where: { organizationId }, select: { id: true, name: true } }),
    prisma.realtyProperty.findMany({
      where: { organizationId, status: { in: CLOSED_STATUSES } },
      select: {
        id: true,
        title: true,
        operation: true,
        propertyType: true,
        zoneId: true,
        price: true,
        availableSince: true,
        bedrooms: true,
        _count: { select: { media: true } },
        // Fecha de cierre: la última vez que pasó a vendida/rentada; si no hay historial, el cierre registrado.
        statusHistory: { where: { toStatus: { in: CLOSED_STATUSES } }, orderBy: { changedAt: "desc" }, take: 1, select: { changedAt: true } },
        advisorUserId: true,
        closings: { orderBy: { closedAt: "desc" }, take: 1, select: { closedAt: true, profile: { select: { source: true } } } },
      },
      take: CAP,
    }),
    prisma.realtyProperty.findMany({
      where: { organizationId, status: { in: OPEN_STATUSES } },
      select: { operation: true, propertyType: true, zoneId: true, price: true, advisorUserId: true },
      take: CAP,
    }),
    prisma.realtyLeadProfile.findMany({
      where: { organizationId, active: true },
      select: { operation: true, maxBudget: true, zones: { select: { zoneId: true } }, matches: { orderBy: { totalScore: "desc" }, take: 1, select: { totalScore: true } } },
      take: CAP,
    }),
  ]);

  const inRange = closedRows
    .map((p) => ({ p, closedAt: p.statusHistory[0]?.changedAt ?? p.closings[0]?.closedAt ?? null }))
    .filter((x): x is { p: (typeof closedRows)[number]; closedAt: Date } => x.closedAt !== null && x.closedAt >= range.from && x.closedAt < range.to);

  const ids = inRange.map((x) => x.p.id);
  const events = ids.length
    ? await prisma.realtyPropertyEvent.groupBy({ by: ["propertyId", "type"], where: { organizationId, propertyId: { in: ids } }, _count: { _all: true } })
    : [];
  const stats = new Map<string, { views: number; interest: number }>();
  for (const e of events) {
    const s = stats.get(e.propertyId) ?? { views: 0, interest: 0 };
    const n = e._count._all;
    if (e.type === "VIEW") s.views += n;
    else if (e.type !== "INQUIRY") s.interest += n;
    stats.set(e.propertyId, s);
  }

  const closed: ClosedProperty[] = inRange.map(({ p, closedAt }) => ({
    id: p.id,
    title: p.title,
    operation: p.operation,
    propertyType: p.propertyType,
    zoneId: p.zoneId,
    price: Number(p.price),
    listedAt: p.availableSince,
    closedAt,
    views: stats.get(p.id)?.views ?? 0,
    interest: stats.get(p.id)?.interest ?? 0,
    photos: p._count.media,
    bedrooms: p.bedrooms,
    advisorKey: p.advisorUserId,
    channelKey: p.closings[0]?.profile?.source ?? null,
  }));
  const open: OpenProperty[] = openRows.map(({ advisorUserId, ...p }) => ({ ...p, price: Number(p.price), advisorKey: advisorUserId }));
  const unmet: UnmetProfile[] = profileRows.map((p) => ({
    operation: p.operation,
    maxBudget: Number(p.maxBudget),
    zoneIds: p.zones.map((z) => z.zoneId),
    bestScore: p.matches[0]?.totalScore ?? null,
  }));
  const advisors = await prisma.user.findMany({ where: { organizationId, id: { in: [...new Set([...closed, ...open].map((p) => p.advisorKey).filter((x): x is string => !!x))] } }, select: { id: true, name: true, email: true } });
  return { zones, closed, open, unmet, advisors: new Map(advisors.map((a) => [a.id, a.name ?? a.email])) };
}
