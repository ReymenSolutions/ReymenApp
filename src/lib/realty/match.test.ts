import { describe, it, expect } from "vitest";
import { areaScore, budgetScore, computeMatch, extrasScore, fitsBudget, roomsScore, typeScore, zoneScore, type MatchProfile, type MatchProperty } from "./match";

const profile: MatchProfile = {
  operation: "SALE",
  propertyType: "HOUSE",
  minBudget: 3_000_000,
  maxBudget: 4_500_000,
  zoneIds: ["cumbres", "mitras"],
  minBedrooms: 3,
  minBathrooms: 2,
  minArea: 180,
  preferences: ["parking", "garden"],
};
const property: MatchProperty = {
  operation: "SALE",
  propertyType: "HOUSE",
  price: 4_200_000,
  zoneId: "cumbres",
  bedrooms: 3,
  bathrooms: 2.5,
  constructionArea: 200,
  landArea: 160,
  features: ["parking", "garden", "security"],
};

describe("match prospecto ↔ propiedad", () => {
  it("presupuesto: dentro del rango 100, se degrada arriba del máximo y poco abajo del mínimo", () => {
    expect(budgetScore(4_000_000, 3_000_000, 4_500_000)).toBe(100);
    expect(budgetScore(4_950_000, 3_000_000, 4_500_000)).toBe(50); // 10 % arriba
    expect(budgetScore(5_400_000, 3_000_000, 4_500_000)).toBe(0); // 20 % arriba
    expect(budgetScore(2_400_000, 3_000_000, 4_500_000)).toBe(75); // 20 % abajo
    expect(budgetScore(1_000_000, 3_000_000, 4_500_000)).toBe(50); // nunca menos de 50 por barato
    expect(budgetScore(1, null, 0)).toBe(0);
  });

  it("zona por prioridad; sin zonas elegidas es neutral", () => {
    expect(zoneScore("cumbres", ["cumbres", "mitras"])).toBe(100);
    expect(zoneScore("mitras", ["cumbres", "mitras"])).toBe(85);
    expect(zoneScore("apodaca", ["a", "b", "apodaca"])).toBe(70);
    expect(zoneScore("san-pedro", ["cumbres"])).toBe(0);
    expect(zoneScore("san-pedro", [])).toBe(60);
  });

  it("tipo exacto, cercano o distinto", () => {
    expect(typeScore("HOUSE", "HOUSE")).toBe(100);
    expect(typeScore("APARTMENT", "HOUSE")).toBe(40);
    expect(typeScore("LAND", "HOUSE")).toBe(0);
    expect(typeScore("LAND", null)).toBe(70);
  });

  it("recámaras/baños y superficie", () => {
    expect(roomsScore({ bedrooms: 3, bathrooms: 2 }, 3, 2)).toBe(100);
    expect(roomsScore({ bedrooms: 2, bathrooms: 2 }, 3, 2)).toBe(75); // (50 + 100) / 2
    expect(roomsScore({ bedrooms: 1, bathrooms: 2 }, 3, null)).toBe(0);
    expect(roomsScore({ bedrooms: null, bathrooms: null }, null, null)).toBe(100);
    expect(areaScore({ constructionArea: 200, landArea: null, propertyType: "HOUSE" }, 180)).toBe(100);
    expect(areaScore({ constructionArea: 144, landArea: null, propertyType: "HOUSE" }, 180)).toBe(50); // 80 %
    expect(areaScore({ constructionArea: 100, landArea: null, propertyType: "HOUSE" }, 180)).toBe(0); // < 60 %
    expect(areaScore({ constructionArea: null, landArea: 300, propertyType: "LAND" }, 250)).toBe(100);
  });

  it("extras: porcentaje de lo pedido", () => {
    expect(extrasScore(["parking"], ["parking", "garden"])).toBe(50);
    expect(extrasScore([], [])).toBe(100);
  });

  it("score final ponderado y con desglose", () => {
    const m = computeMatch(profile, property);
    expect(m).toEqual({ eligible: true, total: 100, budget: 100, zone: 100, type: 100, rooms: 100, area: 100, extras: 100 });
    const pricey = computeMatch(profile, { ...property, price: 4_950_000, zoneId: "mitras", features: ["parking"] });
    // 50·.30 + 85·.25 + 100·.15 + 100·.15 + 100·.10 + 50·.05 = 15 + 21.25 + 15 + 15 + 10 + 2.5 = 78.75
    expect(pricey.total).toBe(79);
    expect(pricey.budget).toBe(50);
  });

  it("fuera de sus zonas, otro tipo o muy caro se topa en 60", () => {
    const outside = computeMatch(profile, { ...property, zoneId: "apodaca" });
    expect(outside.zone).toBe(0);
    expect(outside.total).toBe(60); // sin tope serían 75
    expect(computeMatch(profile, { ...property, propertyType: "LAND" }).total).toBeLessThanOrEqual(60);
    expect(computeMatch(profile, { ...property, price: 6_000_000 }).total).toBeLessThanOrEqual(60);
  });

  it("operación distinta no es match", () => {
    expect(computeMatch(profile, { ...property, operation: "RENT" })).toMatchObject({ eligible: false, total: 0 });
  });

  it("cabe en presupuesto para oferta/demanda", () => {
    expect(fitsBudget(4_000_000, 3_000_000, 4_500_000)).toBe(true);
    expect(fitsBudget(4_600_000, 3_000_000, 4_500_000)).toBe(false);
    expect(fitsBudget(2_000_000, 3_000_000, 4_500_000)).toBe(false);
  });
});
