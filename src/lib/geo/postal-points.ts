// Solo servidor. Centro aproximado de cada código postal, para dibujar en un
// mapa datos agregados por CP (nunca domicilios). No hay un catálogo oficial
// de centroides instalado, así que se busca cada CP una sola vez en el
// geocodificador (su colonia principal según SEPOMEX, o el CP) y se guarda en
// PostalCodePoint, compartido por todas las empresas (es un dato público).
//
// Las búsquedas respetan el límite del geocodificador (1 por segundo, ver
// realty/geocode.ts): en una carga se ubican pocos CP y el resto después de
// responder; al volver a abrir el mapa ya aparecen.

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { geocodeStructured, geocoderEnabled } from "@/lib/realty/geocode";
import { lookupPostalCode } from "@/lib/realty/postal";

export interface PostalPoint {
  lat: number;
  lng: number;
}

/** Si no se encontró, se reintenta después de esto. */
const RETRY_MS = 7 * 24 * 3_600_000;
/** CP que se ubican antes de responder (cada uno tarda ~1 s). */
const INLINE_BUDGET = 3;
/** CP que se ubican después de responder, por carga. */
const BACKGROUND_BUDGET = 25;

const valid = (cp: string) => /^\d{5}$/.test(cp);

/** Puntos ya conocidos. */
export async function loadPostalPoints(postalCodes: string[]): Promise<Map<string, PostalPoint>> {
  const cps = [...new Set(postalCodes.filter(valid))];
  if (cps.length === 0) return new Map();
  const rows = await prisma.postalCodePoint.findMany({ where: { postalCode: { in: cps }, latitude: { not: null }, longitude: { not: null } } });
  return new Map(rows.map((r) => [r.postalCode, { lat: r.latitude!, lng: r.longitude! }]));
}

/** Busca un CP y guarda el resultado (también si no se encontró). */
export async function locatePostalCode(organizationId: string, cp: string): Promise<PostalPoint | null> {
  let point: PostalPoint | null = null;
  let precision: string | null = null;
  try {
    const info = await lookupPostalCode(cp);
    const { results, precision: p } = await geocodeStructured(organizationId, {
      street: "",
      colonia: info?.colonias[0]?.nombre ?? "",
      municipio: info?.municipio ?? "",
      estado: info?.estado ?? "",
      cp,
    });
    // Solo sirve si se ubicó la colonia o el CP; el municipio quedaría en el centro de la ciudad.
    if (results[0] && (p === "colonia" || p === "postal")) {
      point = { lat: results[0].lat, lng: results[0].lng };
      precision = p;
    }
  } catch (err) {
    console.error("[geo/postal-points]", cp, err instanceof Error ? err.message : err);
    return null; // Error del servicio: no se guarda, se reintenta en la siguiente carga.
  }
  const data = { latitude: point?.lat ?? null, longitude: point?.lng ?? null, precision, lastTriedAt: new Date() };
  await prisma.postalCodePoint.upsert({ where: { postalCode: cp }, create: { postalCode: cp, ...data }, update: data });
  return point;
}

async function pending(postalCodes: string[], known: Map<string, PostalPoint>, now: Date): Promise<string[]> {
  const missing = [...new Set(postalCodes.filter((cp) => valid(cp) && !known.has(cp)))];
  if (missing.length === 0) return [];
  const tried = await prisma.postalCodePoint.findMany({ where: { postalCode: { in: missing } }, select: { postalCode: true, lastTriedAt: true } });
  const recent = new Set(tried.filter((t) => now.getTime() - t.lastTriedAt.getTime() < RETRY_MS).map((t) => t.postalCode));
  return missing.filter((cp) => !recent.has(cp));
}

/**
 * Puntos de los CP; ubica antes de responder unos pocos que falten y agenda el
 * resto. Nunca falla: un CP sin punto simplemente no se dibuja.
 */
export async function postalPointsFor(organizationId: string, postalCodes: string[], now = new Date()): Promise<Map<string, PostalPoint>> {
  const known = await loadPostalPoints(postalCodes);
  if (!geocoderEnabled() || process.env.NODE_ENV === "test") return known;
  let todo: string[];
  try {
    todo = await pending(postalCodes, known, now);
  } catch {
    return known;
  }
  for (const cp of todo.slice(0, INLINE_BUDGET)) {
    const p = await locatePostalCode(organizationId, cp);
    if (p) known.set(cp, p);
  }
  const rest = todo.slice(INLINE_BUDGET, INLINE_BUDGET + BACKGROUND_BUDGET);
  if (rest.length) {
    const run = async () => {
      for (const cp of rest) await locatePostalCode(organizationId, cp);
    };
    try {
      after(run);
    } catch {
      void run();
    }
  }
  return known;
}
