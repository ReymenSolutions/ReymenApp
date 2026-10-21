import { describe, it, expect } from "vitest";
import { matchZone } from "./zone-match";

const zones = [
  { id: "a", name: "Santa Cecilia 5009", postalCode: "64150" },
  { id: "b", name: "Cumbres", postalCode: null },
  { id: "c", name: "Álvaro Obregón", postalCode: null },
];

describe("matchZone", () => {
  it("coincide por nombre de colonia sin importar acentos ni mayúsculas", () => {
    expect(matchZone(zones, "alvaro obregon", "")?.id).toBe("c");
  });
  it("coincide por CP", () => {
    expect(matchZone(zones, "Villa Santa Cecilia", "64150")?.id).toBe("a");
  });
  it("coincide cuando el nombre de la zona empieza con la colonia", () => {
    expect(matchZone(zones, "Santa Cecilia", "")?.id).toBe("a");
  });
  it("no inventa zona para otra dirección", () => {
    expect(matchZone(zones, "Vista Hermosa", "64620")).toBeNull();
  });
});
