// Solo servidor. Punto aproximado (para el mapa de demanda y la ubicación
// aproximada de la landing) de una zona, que es una colonia.
//
// 1) Se busca la colonia o su CP en el geocodificador (nunca una casa; si solo
//    se encontrara el municipio, no sirve: quedaría en el centro de la ciudad).
// 2) Si no se encuentra, se usa el centro de las propiedades ubicadas de esa
//    zona redondeado a ~1 km (2 decimales), para no revelar ninguna casa.

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { geocodeStructured } from "./geocode";

export interface ZoneGeoAddress {
  colonia: string;
  postalCode: string | null;
  municipality: string | null;
  state: string | null;
}

/** Redondeo a 2 decimales (~1.1 km): suficiente para un mapa por colonia y no apunta a una casa. */
export const roughCoord = (n: number) => Math.round(n * 100) / 100;

/** Centro aproximado de las propiedades ubicadas de cada zona (solo zonas sin punto propio). */
export async function zoneCentroids(organizationId: string, zoneIds: string[]): Promise<Map<string, { lat: number; lng: number }>> {
  if (zoneIds.length === 0) return new Map();
  const rows = await prisma.realtyProperty.groupBy({
    by: ["zoneId"],
    where: { organizationId, zoneId: { in: zoneIds }, latitude: { not: null }, longitude: { not: null } },
    _avg: { latitude: true, longitude: true },
  });
  const out = new Map<string, { lat: number; lng: number }>();
  for (const r of rows) {
    if (r._avg.latitude !== null && r._avg.longitude !== null) out.set(r.zoneId, { lat: roughCoord(r._avg.latitude), lng: roughCoord(r._avg.longitude) });
  }
  return out;
}

export async function geocodeZoneIfMissing(organizationId: string, zoneId: string, a: ZoneGeoAddress): Promise<void> {
  const zone = await prisma.realtyZone.findFirst({ where: { id: zoneId, organizationId }, select: { latitude: true } });
  if (!zone || zone.latitude !== null) return;
  let point: { lat: number; lng: number } | null = null;
  try {
    const { results, precision } = await geocodeStructured(organizationId, { street: "", colonia: a.colonia, municipio: a.municipality ?? "", estado: a.state ?? "", cp: a.postalCode ?? "" });
    if (results[0] && (precision === "colonia" || precision === "postal")) point = { lat: results[0].lat, lng: results[0].lng };
  } catch (err) {
    console.error("[realty/zone-geo] búsqueda de la colonia falló:", err instanceof Error ? err.message : err);
  }
  point ??= (await zoneCentroids(organizationId, [zoneId])).get(zoneId) ?? null;
  if (!point) return;
  await prisma.realtyZone.updateMany({ where: { id: zoneId, organizationId, latitude: null }, data: { latitude: point.lat, longitude: point.lng } });
}

export function scheduleZoneGeocode(organizationId: string, zoneId: string, a: ZoneGeoAddress): void {
  const run = () => geocodeZoneIfMissing(organizationId, zoneId, a).catch((err) => console.error("[realty/zone-geo]", err instanceof Error ? err.message : err));
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Ubica en el mapa las zonas que aún no tienen punto (zonas creadas a mano o antes de que esto fuera automático). Pocas por
 * vuelta para no saturar al geocodificador; la siguiente visita a Mercado o Configuración continúa con las que falten.
 */
export async function backfillZoneGeo(organizationId: string, limit = 4): Promise<number> {
  const zones = await prisma.realtyZone.findMany({ where: { organizationId, latitude: null }, take: limit, orderBy: { createdAt: "asc" }, select: { id: true, name: true, postalCode: true } });
  for (const z of zones) await geocodeZoneIfMissing(organizationId, z.id, { colonia: z.name, postalCode: z.postalCode, municipality: null, state: null });
  return zones.length;
}

export function scheduleZoneBackfill(organizationId: string): void {
  const run = () => backfillZoneGeo(organizationId).catch((err) => console.error("[realty/zone-geo]", err instanceof Error ? err.message : err));
  try {
    after(run);
  } catch {
    void run();
  }
}
