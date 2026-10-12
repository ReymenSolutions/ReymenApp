// Pure module — importable from client and server contexts.
//
// Posición de cada código postal en el mapa de clientes. El mapa nunca usa
// domicilios: agrega por CP y dibuja cada CP en un punto representativo.
//
// IMPORTANTE (demo): aquí todavía no hay un catálogo real de centroides de
// códigos postales (SEPOMEX/INEGI). Las posiciones de abajo son ILUSTRATIVAS,
// expresadas como desplazamiento en km respecto al punto de referencia del
// programa (la sucursal), para que la demo cuente bien la historia de zonas
// cercanas y lejanas sin aparentar una precisión geográfica que no existe.
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
  "64630": { eastKm: 1.0, northKm: -0.75 },
  "64619": { eastKm: -0.35, northKm: 2.35 },
  "64639": { eastKm: -0.9, northKm: -1.85 },
  "64640": { eastKm: 2.7, northKm: -1.8 },
  "64650": { eastKm: -3.2, northKm: -2.4 },
  "64700": { eastKm: 4.6, northKm: 4.4 },
};

export function zonePosition(postalCode: string): ZonePosition | null {
  return DEMO_ZONE_POSITIONS[postalCode] ?? null;
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
