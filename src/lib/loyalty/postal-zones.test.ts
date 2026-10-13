import { describe, it, expect } from "vitest";
import { offsetToLatLng, zoneDistanceKm, normalizePostalCode, DEMO_ZONE_POSITIONS } from "./postal-zones";

describe("postal-zones", () => {
  it("convierte km este/norte a coordenadas alrededor de la sucursal", () => {
    const ref = { lat: 25.7333, lng: -100.3925 };
    expect(offsetToLatLng(ref, { eastKm: 0, northKm: 0 })).toEqual(ref);
    const north = offsetToLatLng(ref, { eastKm: 0, northKm: 1 });
    expect(north.lat - ref.lat).toBeCloseTo(1 / 110.574, 5);
    expect(north.lng).toBe(ref.lng);
    const east = offsetToLatLng(ref, { eastKm: 1, northKm: 0 });
    // 1 km al este a ~25.7° de latitud ≈ 0.00998° de longitud
    expect(east.lng - ref.lng).toBeCloseTo(0.00998, 4);
  });

  it("todas las zonas demo quedan a menos de 7 km de la sucursal", () => {
    for (const cp of Object.keys(DEMO_ZONE_POSITIONS)) expect(zoneDistanceKm(cp)!).toBeLessThan(7);
    expect(zoneDistanceKm("99999")).toBeNull();
  });

  it("normaliza códigos postales de 5 dígitos", () => {
    expect(normalizePostalCode(" 64 610 ")).toBe("64610");
    expect(normalizePostalCode("6461")).toBeNull();
  });
});
