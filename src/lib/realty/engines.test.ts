import { describe, it, expect } from "vitest";
import { balanceStatus, budgetBands, demandRatio, emergingZones, operationSplit, sourcingOpportunities, topPreferences, typeBalances, zoneBalances, type DemandProfile, type SupplyProperty } from "./market";
import { engagementPoints, freshnessScore, isBoostCandidate, isStagnant, median, stagnationReason, priceInsight, propertyOpportunity, zoneOpportunity, PRICE_INSIGHT_DISCLAIMER, type ScoredProperty } from "./scores";
import { analyzeCampaigns, campaignMetrics, campaignTotals, safeDiv } from "./campaigns";
import { buildToday } from "./today";

const NOW = new Date("2026-10-15T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const zones = [
  { id: "cumbres", name: "Cumbres" },
  { id: "sanpedro", name: "San Pedro" },
  { id: "apodaca", name: "Apodaca" },
];

let seq = 0;
function prof(over: Partial<DemandProfile> = {}): DemandProfile {
  return { id: `p${++seq}`, operation: "SALE", propertyType: "HOUSE", minBudget: null, maxBudget: 4_500_000, zoneIds: ["cumbres"], preferences: [], createdAt: daysAgo(10), ...over };
}
function prop(over: Partial<ScoredProperty> = {}): ScoredProperty {
  return { id: `h${++seq}`, operation: "SALE", propertyType: "HOUSE", status: "AVAILABLE", price: 4_000_000, zoneId: "cumbres", constructionArea: 200, landArea: 160, listedAt: daysAgo(10), ...over };
}

describe("oferta vs demanda", () => {
  it("lectura del balance con muestra mínima", () => {
    expect(balanceStatus(1, 1)).toBe("LOW_DATA");
    expect(balanceStatus(6, 2)).toBe("HIGH_DEMAND");
    expect(balanceStatus(3, 0)).toBe("HIGH_DEMAND");
    expect(balanceStatus(1, 5)).toBe("OVERSUPPLY");
    expect(balanceStatus(4, 3)).toBe("BALANCED");
    expect(demandRatio(5, 0)).toBeNull();
    expect(demandRatio(5, 2)).toBe(2.5);
  });

  it("vendidas, rentadas, inactivas, reservadas y en negociación no cuentan como oferta", () => {
    const profiles = [prof(), prof(), prof({ zoneIds: ["sanpedro", "cumbres"] })];
    const properties: SupplyProperty[] = [
      prop(),
      prop({ status: "SOLD" }),
      prop({ status: "RENTED", operation: "RENT" }),
      prop({ status: "INACTIVE" }),
      prop({ status: "RESERVED" }),
      prop({ status: "NEGOTIATION" }),
    ];
    const z = zoneBalances(zones, profiles, properties);
    const cumbres = z.find((x) => x.zoneId === "cumbres")!;
    expect(cumbres).toMatchObject({ demand: 3, supply: 1, primaryDemand: 2, status: "HIGH_DEMAND" });
    expect(z.find((x) => x.zoneId === "sanpedro")).toMatchObject({ demand: 1, primaryDemand: 1, supply: 0 });
  });

  it("rangos de presupuesto, compra vs renta, tipos y extras", () => {
    const profiles = [prof({ maxBudget: 3_000_000 }), prof({ maxBudget: 3_500_000 }), prof({ maxBudget: 8_000_000, propertyType: "APARTMENT" }), prof({ operation: "RENT", maxBudget: 20_000, preferences: ["pet_friendly"] })];
    const properties = [prop({ price: 3_200_000 }), prop({ price: 12_000_000 }), prop({ operation: "RENT", price: 18_000, propertyType: "APARTMENT" })];
    const bands = budgetBands(profiles, properties, "SALE");
    expect(bands.find((b) => b.band.key === "2-4m")).toMatchObject({ demand: 2, supply: 1 });
    expect(bands.find((b) => b.band.key === "gt10m")).toMatchObject({ demand: 0, supply: 1 });
    const split = operationSplit(profiles, properties);
    expect(split).toEqual([
      { operation: "SALE", demand: 3, supply: 2, demandPct: 75 },
      { operation: "RENT", demand: 1, supply: 1, demandPct: 25 },
    ]);
    expect(typeBalances(profiles, properties, "SALE")[0]).toMatchObject({ propertyType: "HOUSE", demand: 2, supply: 2 });
    expect(topPreferences(profiles)).toEqual([{ key: "pet_friendly", count: 1, pct: 25 }]);
  });

  it("zona emergente exige muestra mínima y crecimiento", () => {
    const period = { from: daysAgo(30), to: NOW };
    const profiles = [
      // Apodaca: 4 nuevos vs 1 previo → +300 %
      ...[1, 2, 3, 4].map(() => prof({ zoneIds: ["apodaca"], createdAt: daysAgo(5) })),
      prof({ zoneIds: ["apodaca"], createdAt: daysAgo(40) }),
      // San Pedro: 2 nuevos vs 0 → muestra insuficiente
      prof({ zoneIds: ["sanpedro"], createdAt: daysAgo(3) }),
      prof({ zoneIds: ["sanpedro"], createdAt: daysAgo(3) }),
      // Cumbres: 3 nuevos vs 3 previos → sin crecimiento
      ...[1, 2, 3].map(() => prof({ createdAt: daysAgo(5) })),
      ...[1, 2, 3].map(() => prof({ createdAt: daysAgo(45) })),
    ];
    const e = emergingZones(zones, profiles, period);
    expect(e).toEqual([{ zoneId: "apodaca", zoneName: "Apodaca", current: 4, previous: 1, growthPct: 300 }]);
  });

  it("captación: demanda sin oferta que le quepa", () => {
    const profiles = [1, 2, 3, 4].map(() => prof({ zoneIds: ["sanpedro"], maxBudget: 9_000_000, minBudget: 6_000_000 }));
    const properties = [prop({ zoneId: "sanpedro", price: 15_000_000 })];
    const s = sourcingOpportunities(zones, profiles, properties);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ zoneId: "sanpedro", demand: 4, supply: 0, operation: "SALE", propertyType: "HOUSE" });
    expect(s[0].band.key).toBe("6-10m");
    // con 2 propiedades que sí caben ya no es oportunidad (2·3 > 4)
    expect(sourcingOpportunities(zones, profiles, [prop({ zoneId: "sanpedro", price: 7_000_000 }), prop({ zoneId: "sanpedro", price: 8_000_000 })])).toHaveLength(0);
  });
});

describe("scores", () => {
  it("todos los scores quedan entre 0 y 100", () => {
    const properties = [prop(), prop({ price: 9_000_000, listedAt: daysAgo(400) }), prop({ zoneId: "apodaca" })];
    const profiles = [prof(), prof(), prof(), prof({ zoneIds: ["sanpedro"] })];
    const engagement = new Map([[properties[0].id, { views: 900, whatsapp: 50, schedule: 9, share: 3 }]]);
    for (const p of properties) {
      const s = propertyOpportunity(p, { profiles, properties, engagement, now: NOW });
      for (const v of [s.total, s.zoneDemand, s.priceFit, s.engagement, s.freshness, s.competition]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
    for (const z of zoneOpportunity(zones, { profiles, properties, engagement, period: { from: daysAgo(30), to: NOW } })) {
      expect(z.total).toBeGreaterThanOrEqual(0);
      expect(z.total).toBeLessThanOrEqual(100);
    }
  });

  it("opportunity de una propiedad explicado por sus partes", () => {
    const hot = prop();
    const properties = [hot, prop({ price: 4_400_000 })]; // 1 competidor a ±20 %
    const profiles = [prof(), prof(), prof(), prof({ maxBudget: 3_000_000 })];
    const engagement = new Map([[hot.id, { views: 20, whatsapp: 2, schedule: 1, share: 0 }]]);
    const s = propertyOpportunity(hot, { profiles, properties, engagement, now: NOW });
    expect(s.facts).toMatchObject({ demand: 4, supply: 2, fitting: 3, points: 33, days: 10, competitors: 1 });
    expect(s).toMatchObject({ zoneDemand: 100, priceFit: 75, engagement: 100, freshness: 100, competition: 75 });
    // 100·.30 + 75·.25 + 100·.20 + 100·.15 + 75·.10 = 30 + 18.75 + 20 + 15 + 7.5 = 91.25
    expect(s.total).toBe(91);
    expect(isBoostCandidate(hot, s)).toBe(true);
  });

  it("frescura y estancada", () => {
    expect(freshnessScore(10)).toBe(100);
    expect(freshnessScore(105)).toBe(50);
    expect(freshnessScore(400)).toBe(0);
    const old = prop({ listedAt: daysAgo(90) });
    const s = propertyOpportunity(old, { profiles: [], properties: [old], engagement: new Map(), now: NOW });
    expect(isStagnant(old, s, 0)).toBe(true);
    expect(isStagnant(old, s, 1)).toBe(false);
    expect(isStagnant({ ...old, status: "SOLD" }, s, 0)).toBe(false);
    expect(stagnationReason(old, s, 0)).toBe("LOW_VIEWS");
    const seen = { ...s, facts: { ...s.facts, points: 120 } };
    expect(stagnationReason(old, seen, 0, { views: 100, whatsapp: 1, schedule: 0, share: 5 })).toBe("LOW_CONTACT");
    expect(stagnationReason(old, seen, 0, { views: 40, whatsapp: 4, schedule: 2, share: 0 })).toBe("NO_VISITS");
    expect(stagnationReason(old, seen, 3, { views: 40, whatsapp: 4, schedule: 2, share: 0 })).toBe("NO_NEGOTIATION");
    expect(stagnationReason({ ...old, listedAt: daysAgo(20) }, propertyOpportunity({ ...old, listedAt: daysAgo(20) }, { profiles: [], properties: [old], engagement: new Map(), now: NOW }), 0)).toBeNull();
    expect(engagementPoints({ views: 1, share: 1, whatsapp: 1, schedule: 1 })).toBe(12);
  });

  it("price insight: muestra mínima, precio por m² y aviso", () => {
    const subject = prop({ price: 5_000_000, constructionArea: 200 }); // 25 000/m²
    const comps = [prop({ price: 4_000_000 }), prop({ price: 4_200_000, status: "SOLD" }), prop({ price: 4_400_000 })]; // 20 000, 21 000, 22 000 /m²
    const pi = priceInsight(subject, [subject, ...comps], [prof(), prof({ maxBudget: 6_000_000 })]);
    expect(pi).toMatchObject({ position: "ABOVE", basis: "m2", median: 21_000, subject: 25_000, diffPct: 19, sample: 3, budgetFitPct: 50, disclaimer: PRICE_INSIGHT_DISCLAIMER });
    expect(PRICE_INSIGHT_DISCLAIMER).toBe("Insight basado en datos internos.");
    expect(priceInsight(subject, [subject, comps[0]], []).position).toBe("INSUFFICIENT");
    expect(median([3, 1, 2, 4])).toBe(2.5);
  });
});

describe("campañas", () => {
  it("división entre cero da null, nunca Infinity", () => {
    expect(safeDiv(100, 0)).toBeNull();
    const m = campaignMetrics({ id: "c", spend: 5000, leadsCount: 0, visitsCount: 0, closingsCount: 0, attributedRevenue: null });
    expect(m).toEqual({ id: "c", cpl: null, costPerVisit: null, costPerClosing: null, roi: null, leadToVisitPct: null, visitToClosingPct: null });
    expect(campaignMetrics({ id: "z", spend: 0, leadsCount: 3, visitsCount: 1, closingsCount: 0, attributedRevenue: 1000 }).roi).toBeNull();
  });

  it("CPL, costo por visita/cierre, ROI y conversión", () => {
    const m = campaignMetrics({ id: "c", spend: 10_000, leadsCount: 40, visitsCount: 8, closingsCount: 1, attributedRevenue: 90_000 });
    expect(m).toEqual({ id: "c", cpl: 250, costPerVisit: 1250, costPerClosing: 10_000, roi: 8, leadToVisitPct: 20, visitToClosingPct: 13 });
  });

  it("eficiente vs deficiente y totales", () => {
    const cs = [
      { id: "good", spend: 8_000, leadsCount: 40, visitsCount: 10, closingsCount: 1, attributedRevenue: 120_000 },
      { id: "mid", spend: 10_000, leadsCount: 25, visitsCount: 4, closingsCount: 0, attributedRevenue: null },
      { id: "bad", spend: 12_000, leadsCount: 10, visitsCount: 1, closingsCount: 0, attributedRevenue: null },
      { id: "zero", spend: 3_000, leadsCount: 0, visitsCount: 0, closingsCount: 0, attributedRevenue: null },
    ];
    const r = Object.fromEntries(analyzeCampaigns(cs).map((x) => [x.id, x.rating]));
    expect(r).toEqual({ good: "EFFICIENT", mid: "NORMAL", bad: "DEFICIENT", zero: "DEFICIENT" });
    const t = campaignTotals(cs);
    expect(t).toMatchObject({ spend: 33_000, leads: 75, visits: 15, closings: 1, cpl: 440, roi: 2.64 });
  });
});

describe("qué hacer hoy", () => {
  it("prioriza, explica y apunta al registro", () => {
    const recs = buildToday({
      now: NOW,
      lang: "es",
      highMatches: [
        { profileId: "p1", profileName: "Ana", propertyId: "h1", propertyTitle: "Casa Cumbres", score: 92, hasVisit: false },
        { profileId: "p2", profileName: "Luis", propertyId: "h1", propertyTitle: "Casa Cumbres", score: 85, hasVisit: true },
      ],
      upcomingVisits: [{ appointmentId: "a1", propertyTitle: "Depa SP", profileName: "Sofía", startsAt: new Date(NOW.getTime() + 3 * 3_600_000), confirmed: false }],
      stagnant: [{ propertyId: "h9", title: "Casa Mitras", days: 130, points: 2 }],
      boost: [],
      sourcing: [],
      deficientCampaigns: [{ id: "c1", name: "Meta Mitras", spend: "$3,000", leads: 0, cpl: null }],
      unmatchedProfiles: [],
      typeLabel: (t) => t ?? "Cualquiera",
      operationLabel: (o) => o,
    });
    expect(recs.map((r) => r.type)).toEqual(["CONFIRM_VISIT", "CONTACT_HIGH_MATCH", "REVIEW_STAGNANT", "REVIEW_CAMPAIGN"]);
    expect(recs.every((r) => r.priority === "HIGH")).toBe(true);
    expect(recs[1]).toMatchObject({ entityType: "profile", entityId: "p1", evidence: ["Match 92/100"], href: "/portal/realty/prospects/p1" });
  });
});
