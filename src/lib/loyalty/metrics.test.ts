import { describe, it, expect } from "vitest";
import {
  activityCutoffs,
  activityStatus,
  buildInsights,
  segmentCounts,
  sharesPct,
  summarizeZones,
  type MemberLite,
  type ZoneRow,
} from "./metrics";

const DAY = 86_400_000;
const NOW = new Date("2026-10-12T18:00:00Z");

describe("sharesPct", () => {
  it("siempre suma exactamente 100 (mayor residuo)", () => {
    const shares = sharesPct([1, 1, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10);
    expect(shares).toEqual([33.4, 33.3, 33.3]);
  });
  it("todo en cero si no hay total", () => {
    expect(sharesPct([0, 0])).toEqual([0, 0]);
  });
});

// Zonas con perfiles distintos, como en el seed de demo.
const ROWS: ZoneRow[] = [
  { postalCode: "64610", members: 137, visits: 312, visitsWithAmount: 300, sales: 69000, prevVisits: 300 },
  { postalCode: "64620", members: 120, visits: 150, visitsWithAmount: 140, sales: 21000, prevVisits: 150 },
  { postalCode: "64619", members: 30, visits: 80, visitsWithAmount: 80, sales: 26000, prevVisits: 80 },
  { postalCode: "64630", members: 6, visits: 10, visitsWithAmount: 10, sales: 1800, prevVisits: 10 },
  { postalCode: "64639", members: 50, visits: 90, visitsWithAmount: 85, sales: 17000, prevVisits: 120 },
];

describe("summarizeZones", () => {
  const s = summarizeZones(ROWS);

  it("las participaciones de clientes y de ventas suman 100", () => {
    expect(s.zones.reduce((a, z) => a + z.memberShare, 0)).toBeCloseTo(100, 6);
    expect(s.zones.reduce((a, z) => a + z.salesShare, 0)).toBeCloseTo(100, 6);
  });

  it("los totales cuadran con la suma de las zonas", () => {
    expect(s.totals.members).toBe(343);
    expect(s.totals.visits).toBe(642);
    expect(s.totals.sales).toBe(134800);
    expect(s.totals.avgTicket).toBe(Math.round((134800 / 615) * 100) / 100);
  });

  it("ticket y frecuencia por zona: ventas ÷ visitas con monto, visitas ÷ clientes", () => {
    const z = s.zones.find((x) => x.postalCode === "64610")!;
    expect(z.avgTicket).toBe(230);
    expect(z.frequency).toBe(2.28);
  });

  it("ordena por ventas y etiqueta zona fuerte, alto valor, baja frecuencia y oportunidad", () => {
    expect(s.zones[0].postalCode).toBe("64610");
    expect(s.zones.find((z) => z.postalCode === "64610")!.labels).toContain("strong");
    expect(s.zones.find((z) => z.postalCode === "64619")!.labels).toContain("high_value");
    expect(s.zones.find((z) => z.postalCode === "64620")!.labels).toContain("low_frequency");
    // 64630 está a ~1.3 km y casi no tiene clientes.
    expect(s.zones.find((z) => z.postalCode === "64630")!.labels).toContain("opportunity");
  });

  it("muchos clientes no significa la zona más valiosa", () => {
    const many = s.zones.find((z) => z.postalCode === "64620")!;
    const few = s.zones.find((z) => z.postalCode === "64619")!;
    expect(many.members).toBeGreaterThan(few.members);
    expect(few.sales).toBeGreaterThan(many.sales);
    expect(few.salesPerMember).toBeGreaterThan(many.salesPerMember * 3);
  });

  it("sin datos no inventa zonas", () => {
    expect(summarizeZones([]).zones).toEqual([]);
  });
});

describe("activityStatus / activityCutoffs", () => {
  it("activo ≤30 días, en riesgo 31–60, inactivo >60; sin visitas se mide desde el alta", () => {
    expect(activityStatus(new Date(NOW.getTime() - 30 * DAY), NOW, NOW)).toBe("active");
    expect(activityStatus(new Date(NOW.getTime() - 31 * DAY), NOW, NOW)).toBe("at_risk");
    expect(activityStatus(new Date(NOW.getTime() - 61 * DAY), NOW, NOW)).toBe("inactive");
    expect(activityStatus(null, new Date(NOW.getTime() - 5 * DAY), NOW)).toBe("active");
  });

  it("las fronteras para filtrar en la base dan la misma clasificación", () => {
    const { activeAfter, riskAfter } = activityCutoffs(NOW);
    for (const days of [0, 29.5, 30, 30.9, 31, 45, 60, 60.9, 61, 90]) {
      const ref = new Date(NOW.getTime() - days * DAY);
      const bySql = ref > activeAfter ? "active" : ref > riskAfter ? "at_risk" : "inactive";
      expect(bySql).toBe(activityStatus(ref, ref, NOW));
    }
  });
});

function member(over: Partial<MemberLite>): MemberLite {
  return {
    id: Math.random().toString(36),
    postalCode: "64610",
    cycleVisits: 0,
    totalVisits: 0,
    visitsWithAmount: 0,
    totalSpent: 0,
    lastVisitAt: null,
    createdAt: new Date(NOW.getTime() - 100 * DAY),
    availableRewards: 0,
    ...over,
  };
}

describe("segmentCounts", () => {
  it("cuenta activos/en riesgo/inactivos y segmentos comerciales", () => {
    const members = [
      member({ cycleVisits: 9, totalVisits: 9, visitsWithAmount: 9, totalSpent: 1800, lastVisitAt: new Date(NOW.getTime() - 2 * DAY) }),
      member({ cycleVisits: 2, totalVisits: 12, visitsWithAmount: 12, totalSpent: 6000, lastVisitAt: new Date(NOW.getTime() - 3 * DAY), availableRewards: 1 }),
      member({ cycleVisits: 1, totalVisits: 1, visitsWithAmount: 0, totalSpent: 0, lastVisitAt: new Date(NOW.getTime() - 45 * DAY) }),
      member({ createdAt: new Date(NOW.getTime() - 3 * DAY) }),
      member({ lastVisitAt: new Date(NOW.getTime() - 80 * DAY), totalVisits: 2 }),
    ];
    const c = segmentCounts(members, { goal: 10, newSince: new Date(NOW.getTime() - 7 * DAY), now: NOW });
    expect(c).toMatchObject({ total: 5, active: 3, atRisk: 1, inactive: 1 });
    expect(c.segments.one_away).toBe(1);
    expect(c.segments.reward_available).toBe(1);
    expect(c.segments.new).toBe(1);
    expect(c.segments.frequent).toBe(2);
    expect(c.segments.high_ticket).toBe(1);
  });
});

describe("buildInsights", () => {
  it("deriva insights de las métricas, con el CP y los números que los sostienen", () => {
    const summary = summarizeZones(ROWS);
    const segments = segmentCounts([member({ cycleVisits: 9 }), member({ cycleVisits: 9 })], { goal: 10, newSince: NOW, now: NOW });
    const insights = buildInsights({ summary, segments, availableRewards: 3 });
    const kinds = insights.map((i) => i.kind);
    expect(kinds).toContain("leader_zone");
    expect(insights.find((i) => i.kind === "leader_zone")!.postalCode).toBe("64610");
    expect(insights.find((i) => i.kind === "leader_zone")!.values.share).toBe(summary.zones[0].salesShare);
    expect(kinds).toContain("opportunity_zone");
    expect(insights.find((i) => i.kind === "one_away")!.values.count).toBe(2);
    expect(insights.find((i) => i.kind === "rewards_waiting")!.values.count).toBe(3);
    // 64639 pasó de 120 a 90 visitas (-25%).
    expect(insights.find((i) => i.kind === "frequency_drop_zone")!.postalCode).toBe("64639");
  });

  it("sin datos no produce insights", () => {
    const insights = buildInsights({ summary: summarizeZones([]), segments: segmentCounts([], { goal: 10, newSince: NOW, now: NOW }), availableRewards: 0 });
    expect(insights).toEqual([]);
  });
});
