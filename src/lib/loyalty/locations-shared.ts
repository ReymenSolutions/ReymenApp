// Pure module — importable from client and server contexts.

import type { GeoPoint } from "./postal-zones";

/** branchKey de la sucursal Principal implícita (branchId null). */
export const MAIN_LOCATION_KEY = "main";

/** Un punto de venta con su ubicación para el mapa (null = todavía sin fijar). */
export interface LoyaltyLocationView {
  key: string;
  branchId: string | null;
  label: string;
  postalCode: string | null;
  point: GeoPoint | null;
}
