import { describe, it, expect } from "vitest";
import { DEMO_ANCHOR, DEMO_ZONE_POSITIONS, distanceKm, isValidPoint, normalizePostalCode, offsetToLatLng, zoneDistanceKm, zonePoint } from "./postal-zones";

describe("postal-zones", () => {
  it("convierte km este/norte a coordenadas alrededor de un punto", () => {
    const ref = { lat: 25.7333, lng: -100.3925 };
    expect(offsetToLatLng(ref, { eastKm: 0, northKm: 0 })).toEqual(ref);
    const north = offsetToLatLng(ref, { eastKm: 0, northKm: 1 });
    expect(north.lat - ref.lat).toBeCloseTo(1 / 110.574, 5);
    expect(north.lng).toBe(ref.lng);
    const east = offsetToLatLng(ref, { eastKm: 1, northKm: 0 });
    // 1 km al este a ~25.7° de latitud ≈ 0.00998° de longitud
    expect(east.lng - ref.lng).toBeCloseTo(0.00998, 4);
  });

  it("la distancia haversine coincide con el desplazamiento en km", () => {
    const p = offsetToLatLng(DEMO_ANCHOR, { eastKm: 3, northKm: 4 });
    expect(distanceKm(DEMO_ANCHOR, p)).toBeCloseTo(5, 1);
  });

  it("mide cada CP contra el punto de venta más cercano", () => {
    for (const cp of Object.keys(DEMO_ZONE_POSITIONS)) expect(zoneDistanceKm(cp, [DEMO_ANCHOR])).toBeNull();
    expect(zoneDistanceKm("99999", [DEMO_ANCHOR])).toBeNull();
    expect(zoneDistanceKm("64610", [])).toBeNull();
    const far = { lat: 25.0, lng: -100.0 };
    expect(zoneDistanceKm("64610", [far, DEMO_ANCHOR])).toBe(zoneDistanceKm("64610", [DEMO_ANCHOR]));
    expect(zonePoint("64610")).toBeNull();
    expect(zonePoint("64610", true)).not.toBeNull();
  });

  it("valida coordenadas y códigos postales", () => {
    expect(isValidPoint(25.7, -100.4)).toBe(true);
    expect(isValidPoint(95, 0)).toBe(false);
    expect(isValidPoint(Number.NaN, 0)).toBe(false);
    expect(normalizePostalCode(" 64 610 ")).toBe("64610");
    expect(normalizePostalCode("6461")).toBeNull();
  });
});
