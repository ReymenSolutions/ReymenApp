// Pure module — importable from client and server contexts.
//
// Dónde se dibuja cada código postal en el mapa de clientes y a qué distancia
// queda de los puntos de venta. El mapa nunca usa domicilios: agrega por CP y
// dibuja cada CP en un punto representativo.
//
// IMPORTANTE (demo): todavía no hay un catálogo real de centroides de códigos
// postales (SEPOMEX/INEGI). Los puntos de abajo son APROXIMADOS, definidos en
// km alrededor de un ancla en Cumbres (Monterrey) para la demo de Café Norte.
// El mapa lo dice en pantalla: el mapa base es real, el punto de cada CP es
// aproximado. Un CP que no esté aquí se analiza igual en tablas e insights,
// pero no se dibuja en el mapa (se lista como "sin ubicación") ni tiene
// distancia. Las ubicaciones de las sucursales sí son reales: las fija el
// negocio en Programa → Ubicación de las sucursales.

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface ZonePosition {
  /** km hacia el este (+) / oeste (-) respecto al ancla. */
  eastKm: number;
  /** km hacia el norte (+) / sur (-) respecto al ancla. */
  northKm: number;
}

/** Ancla de los puntos demo: Cumbres, Monterrey (aprox.). */
export const DEMO_ANCHOR: GeoPoint = { lat: 25.7333, lng: -100.3925 };

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

/**
 * Punto por omisión cuando el negocio todavía no fijó la ubicación de ninguna
 * sucursal: centro de Monterrey. El mapa avisa que falta configurarla.
 */
export const DEFAULT_REFERENCE: GeoPoint = { lat: 25.6714, lng: -100.3093 };

/** Convierte un desplazamiento en km (este/norte) a coordenadas a partir de un punto. */
export function offsetToLatLng(reference: GeoPoint, pos: ZonePosition): GeoPoint {
  const lat = reference.lat + pos.northKm / 110.574;
  const lng = reference.lng + pos.eastKm / (111.32 * Math.cos((reference.lat * Math.PI) / 180));
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

/** Punto representativo (aproximado) de un código postal, o null si no está en el catálogo. */
export function zonePoint(postalCode: string, demo = false): GeoPoint | null {
  if (!demo) return null; // No production postal centroid dataset is installed.
  const pos = DEMO_ZONE_POSITIONS[postalCode];
  return pos ? offsetToLatLng(DEMO_ANCHOR, pos) : null;
}

/** Distancia en línea recta (km) entre dos puntos (haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Distancia (km, 1 decimal) del CP al punto de venta más cercano de `origins`.
 * Null si el CP no tiene punto en el mapa o no hay ningún punto de venta ubicado.
 */
export function zoneDistanceKm(postalCode: string, origins: GeoPoint[], point?: GeoPoint | null): number | null {
  const p = point ?? zonePoint(postalCode);
  if (!p || origins.length === 0) return null;
  const km = Math.min(...origins.map((o) => distanceKm(o, p)));
  return Math.round(km * 10) / 10;
}

/** Coordenadas válidas (dentro de rangos reales). */
export function isValidPoint(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Código postal mexicano: 5 dígitos. */
export function normalizePostalCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 5 ? digits : null;
}
