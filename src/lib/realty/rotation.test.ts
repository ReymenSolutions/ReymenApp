import { describe, expect, it } from "vitest";
import {
  compareFastSlow,
  daysOnMarket,
  priceIndexOf,
  rotationOfProperties,
  segmentRotation,
  speedOf,
  summarize,
  unmetDemandByZone,
  type ClosedProperty,
  type OpenProperty,
} from "./rotation";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000);

function closed(over: Partial<ClosedProperty> & { days: number }): ClosedProperty {
  const { days, ...rest } = over;
  return {
    id: Math.random().toString(36).slice(2),
    title: "Casa",
    operation: "SALE",
    propertyType: "HOUSE",
    zoneId: "z1",
    price: 3_000_000,
    listedAt: day(0),
    closedAt: day(days),
    views: 10,
    interest: 5,
    photos: 5,
    bedrooms: 3,
    ...rest,
  };
}

describe("rotación", () => {
  it("cuenta días y clasifica la velocidad", () => {
    expect(daysOnMarket(day(0), day(45))).toBe(45);
    expect(daysOnMarket(day(10), day(5))).toBe(0);
    expect(speedOf(30)).toBe("FAST");
    expect(speedOf(31)).toBe("NORMAL");
    expect(speedOf(90)).toBe("SLOW");
  });

  it("resume mediana, rápidas, lentas y sell-through", () => {
    const s = summarize([closed({ days: 10 }), closed({ days: 40 }), closed({ days: 120 })], 7);
    expect(s).toMatchObject({ closed: 3, open: 7, medianDays: 40, avgDays: 57, fast: 1, slow: 1, sellThroughPct: 30 });
    expect(summarize([], 0)).toMatchObject({ medianDays: null, sellThroughPct: null });
  });

  it("segmenta con muestra mínima", () => {
    const rows = segmentRotation(
      [closed({ days: 10 }), closed({ days: 20 }), closed({ days: 25 }), closed({ days: 100, zoneId: "z2" })],
      [{ operation: "SALE", propertyType: "HOUSE", zoneId: "z2", price: 1 }],
      (c) => c.zoneId,
      (o) => o.zoneId,
    );
    expect(rows.find((r) => r.key === "z1")).toMatchObject({ closed: 3, medianDays: 20, status: "FAST", sellThroughPct: 100 });
    expect(rows.find((r) => r.key === "z2")).toMatchObject({ closed: 1, open: 1, status: "LOW_DATA", sellThroughPct: 50 });
  });

  it("índice de precio necesita comparables", () => {
    const pool = [3, 3, 3, 4].map((m) => ({ operation: "SALE" as const, propertyType: "HOUSE" as const, price: m * 1_000_000 }));
    expect(priceIndexOf({ operation: "SALE", propertyType: "HOUSE", price: 3_300_000 }, pool)).toBe(1.1);
    expect(priceIndexOf({ operation: "RENT", propertyType: "HOUSE", price: 1 }, pool)).toBeNull();
  });

  it("compara rápidas contra lentas y genera hallazgos", () => {
    const open: OpenProperty[] = [];
    const rows = rotationOfProperties(
      [
        ...[5, 10, 20].map((d) => closed({ days: d, price: 2_800_000, interest: 20, photos: 10 })),
        ...[100, 120, 150].map((d) => closed({ days: d, price: 3_600_000, interest: 4, photos: 3 })),
      ],
      open,
    );
    const cmp = compareFastSlow(rows);
    expect(cmp.enough).toBe(true);
    expect(cmp.insights.map((i) => i.code).sort()).toEqual(["MORE_INTEREST", "MORE_PHOTOS", "PRICE_LOWER"]);
  });

  it("no opina con pocos datos", () => {
    const rows = rotationOfProperties([closed({ days: 5 }), closed({ days: 200 })], []);
    expect(compareFastSlow(rows)).toMatchObject({ enough: false, insights: [] });
  });

  it("demanda sin cubrir por zona", () => {
    const p = (bestScore: number | null, maxBudget: number) => ({ zoneIds: ["zA"], maxBudget, operation: "SALE" as const, bestScore });
    const out = unmetDemandByZone([p(10, 2_000_000), p(null, 3_000_000), p(40, 4_000_000), p(90, 1)], 65);
    expect(out).toEqual([{ zoneId: "zA", count: 3, medianBudget: 3_000_000 }]);
    expect(unmetDemandByZone([p(10, 1), p(20, 1)], 65)).toEqual([]);
  });
});
