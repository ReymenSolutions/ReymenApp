// Pure module — importable from client and server contexts.
//
// Posición de cada código postal en el mapa de clientes. El mapa nunca usa
// domicilios: agrega por CP y dibuja cada CP en un punto representativo.
//
// IMPORTANTE (demo): aquí todavía no hay un catálogo real de centroides de
// códigos postales (SEPOMEX/INEGI). Las posiciones de abajo son ILUSTRATIVAS,
// expresadas como desplazamiento en km respecto al punto de referencia del
// programa (la sucursal). El mapa las convierte a coordenadas sobre
// OpenStreetMap (offsetToLatLng) y lo dice en pantalla: el mapa base es real,
// el punto de cada CP es aproximado.
// Un CP que no esté aquí se analiza igual en tablas e insights, pero no se
// dibuja en el mapa (se lista como "sin ubicación").

export interface ZonePosition {
  /** km hacia el este (+) / oeste (-) respecto a la sucursal. */
  eastKm: number;
  /** km hacia el norte (+) / sur (-) respecto a la sucursal. */
  northKm: number;
}

export const DEMO_ZONE_POSITIONS: Record<string, ZonePosition> = {
  "64610": { eastKm: 0.7, northKm: 0.45 },
  "64620": { eastKm: -1.55, northKm: 0.25 },
  "64630": { eastKm: 1.35, northKm: -1.05 },
  "64619": { eastKm: -0.35, northKm: 2.35 },
  "64639": { eastKm: -0.9, northKm: -1.85 },
  "64640": { eastKm: 2.7, northKm: -1.8 },
  "64650": { eastKm: -3.2, northKm: -2.4 },
  "64700": { eastKm: 4.6, northKm: 4.4 },
};

export function zonePosition(postalCode: string): ZonePosition | null {
  return DEMO_ZONE_POSITIONS[postalCode] ?? null;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Punto de referencia cuando el programa todavía no tiene coordenadas de la
 * sucursal: centro de Monterrey. El mapa avisa que la ubicación es aproximada.
 */
export const DEFAULT_REFERENCE: GeoPoint = { lat: 25.6714, lng: -100.3093 };

/** Convierte un desplazamiento en km (este/norte) a coordenadas, a partir de la sucursal. */
export function offsetToLatLng(reference: GeoPoint, pos: ZonePosition): GeoPoint {
  const lat = reference.lat + pos.northKm / 110.574;
  const lng = reference.lng + pos.eastKm / (111.32 * Math.cos((reference.lat * Math.PI) / 180));
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** Distancia en línea recta (km) del CP a la sucursal, o null si no hay posición. */
export function zoneDistanceKm(postalCode: string): number | null {
  const p = zonePosition(postalCode);
  if (!p) return null;
  return Math.round(Math.hypot(p.eastKm, p.northKm) * 10) / 10;
}

/** Código postal mexicano: 5 dígitos. */
export function normalizePostalCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 5 ? digits : null;
}
