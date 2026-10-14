import { describe, it, expect } from "vitest";
import { applyVisit, averageTicket, normalizeGoal, progressOf } from "./cycle";

describe("progressOf", () => {
  it("cuenta visitas del ciclo contra la meta", () => {
    expect(progressOf(6, 10)).toEqual({ current: 6, goal: 10, remaining: 4, pct: 60, complete: false });
    expect(progressOf(0, 10).remaining).toBe(10);
  });

  it("si la meta bajó por debajo del avance, muestra la meta alcanzada (no 11/10)", () => {
    expect(progressOf(11, 10)).toMatchObject({ current: 10, goal: 10, remaining: 0, complete: true });
  });

  it("normaliza metas fuera de rango", () => {
    expect(normalizeGoal(0)).toBe(1);
    expect(normalizeGoal(500)).toBe(100);
    expect(normalizeGoal(Number.NaN)).toBe(1);
    expect(normalizeGoal(9.6)).toBe(10);
  });
});

describe("applyVisit", () => {
  it("6/10 → 7/10 sin recompensa", () => {
    const r = applyVisit({ cycleNumber: 1, cycleVisits: 6 }, 10);
    expect(r).toEqual({ next: { cycleNumber: 1, cycleVisits: 7 }, countedInCycle: 1, reachedVisits: 7, rewardEarned: false });
  });

  it("9/10 → completa el ciclo: recompensa para el ciclo 1 y el siguiente empieza en 0", () => {
    const r = applyVisit({ cycleNumber: 1, cycleVisits: 9 }, 10);
    expect(r.rewardEarned).toBe(true);
    expect(r.countedInCycle).toBe(1);
    expect(r.next).toEqual({ cycleNumber: 2, cycleVisits: 0 });
  });

  it("una meta que bajó entrega la recompensa en la siguiente visita sin recalcular ciclos cerrados", () => {
    const r = applyVisit({ cycleNumber: 3, cycleVisits: 11 }, 10);
    expect(r.rewardEarned).toBe(true);
    expect(r.countedInCycle).toBe(3);
    expect(r.next).toEqual({ cycleNumber: 4, cycleVisits: 0 });
  });

  it("una meta que subió deja seguir avanzando hacia la nueva meta", () => {
    const r = applyVisit({ cycleNumber: 1, cycleVisits: 9 }, 12);
    expect(r.rewardEarned).toBe(false);
    expect(r.next.cycleVisits).toBe(10);
  });

  it("recorre 25 visitas con meta 10: exactamente 2 recompensas y 5 visitas en el ciclo 3", () => {
    let state = { cycleNumber: 1, cycleVisits: 0 };
    let rewards = 0;
    for (let i = 0; i < 25; i++) {
      const r = applyVisit(state, 10);
      if (r.rewardEarned) rewards++;
      state = r.next;
    }
    expect(rewards).toBe(2);
    expect(state).toEqual({ cycleNumber: 3, cycleVisits: 5 });
  });
});

describe("averageTicket", () => {
  it("divide entre visitas con monto, no entre todas las visitas", () => {
    expect(averageTicket(1430, 7)).toBe(204.29);
    expect(averageTicket(0, 0)).toBe(0);
  });
});
