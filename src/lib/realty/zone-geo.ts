// Solo servidor. Punto aproximado (para el mapa de demanda) de una zona que
// se creó sola a partir de una colonia: se busca la colonia (nunca una casa)
// después de responder. Si no se encuentra, la zona queda sin punto y se
// puede ubicar a mano en Configuración.

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { geocodeStructured } from "./geocode";

export interface ZoneGeoAddress {
  colonia: string;
  postalCode: string | null;
  municipality: string | null;
  state: string | null;
}

export async function geocodeZoneIfMissing(organizationId: string, zoneId: string, a: ZoneGeoAddress): Promise<void> {
  const zone = await prisma.realtyZone.findFirst({ where: { id: zoneId, organizationId }, select: { latitude: true } });
  if (!zone || zone.latitude !== null) return;
  const { results } = await geocodeStructured(organizationId, { street: "", colonia: a.colonia, municipio: a.municipality ?? "", estado: a.state ?? "", cp: a.postalCode ?? "" });
  const top = results[0];
  if (!top) return;
  await prisma.realtyZone.updateMany({ where: { id: zoneId, organizationId, latitude: null }, data: { latitude: top.lat, longitude: top.lng } });
}

export function scheduleZoneGeocode(organizationId: string, zoneId: string, a: ZoneGeoAddress): void {
  const run = () => geocodeZoneIfMissing(organizationId, zoneId, a).catch((err) => console.error("[realty/zone-geo]", err instanceof Error ? err.message : err));
  try {
    after(run);
  } catch {
    void run();
  }
}
