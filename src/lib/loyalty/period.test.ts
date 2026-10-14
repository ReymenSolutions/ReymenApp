import { describe, it, expect } from "vitest";
import { dayKey, resolvePeriod, trendPct, zonedMidnight } from "./period";

const TZ = "America/Mexico_City"; // UTC-6 sin horario de verano desde 2022
const NOW = new Date("2026-10-12T03:30:00Z"); // 11 oct 21:30 en CDMX

describe("resolvePeriod", () => {
  it("'hoy' es el día local del negocio, no el del servidor", () => {
    const p = resolvePeriod({ p: "today" }, TZ, NOW);
    expect(p.days).toEqual(["2026-10-11"]);
    expect(p.from.toISOString()).toBe("2026-10-11T06:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-10-12T06:00:00.000Z");
  });

  it("7 días incluye hoy y el periodo anterior tiene la misma duración", () => {
    const p = resolvePeriod({ p: "7d" }, TZ, NOW);
    expect(p.days).toHaveLength(7);
    expect(p.days[0]).toBe("2026-10-05");
    expect(p.prevTo.getTime()).toBe(p.from.getTime());
    expect(p.from.getTime() - p.prevFrom.getTime()).toBe(7 * 86_400_000);
  });

  it("mes = del día 1 a hoy; un valor desconocido cae a 30 días", () => {
    expect(resolvePeriod({ p: "month" }, TZ, NOW).days[0]).toBe("2026-10-01");
    expect(resolvePeriod({ p: "xyz" }, TZ, NOW).days).toHaveLength(30);
  });

  it("rango personalizado válido; invertido o inválido cae a 30 días", () => {
    const p = resolvePeriod({ p: "custom", from: "2026-09-01", to: "2026-09-10" }, TZ, NOW);
    expect(p.key).toBe("custom");
    expect(p.days).toHaveLength(10);
    expect(resolvePeriod({ p: "custom", from: "2026-09-10", to: "2026-09-01" }, TZ, NOW).key).toBe("30d");
    expect(resolvePeriod({ p: "custom", from: "2026-02-30", to: "2026-03-01" }, TZ, NOW).key).toBe("30d");
  });
});

describe("helpers", () => {
  it("zonedMidnight y dayKey son inversos", () => {
    const m = zonedMidnight(2026, 3, 15, TZ);
    expect(dayKey(m, TZ)).toBe("2026-03-15");
    expect(dayKey(new Date(m.getTime() - 1), TZ)).toBe("2026-03-14");
  });
  it("trendPct", () => {
    expect(trendPct(120, 100)).toBe(20);
    expect(trendPct(5, 0)).toBeNull();
  });
});
