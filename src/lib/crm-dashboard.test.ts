import { describe, it, expect } from "vitest";
import { buildPipelineSummary, percentChange } from "./crm-dashboard";

const stages = [
  { id: "s1", name: "Nuevo", isWon: false, isLost: false },
  { id: "s2", name: "Propuesta", isWon: false, isLost: false },
  { id: "s3", name: "Ganado", isWon: true, isLost: false },
  { id: "s4", name: "Perdido", isWon: false, isLost: true },
];

describe("buildPipelineSummary", () => {
  it("suma solo las etapas abiertas y calcula la parte de cada una", () => {
    const s = buildPipelineSummary(stages, [
      { amount: 1000, currency: "MXN", pipelineStageId: "s1" },
      { amount: 3000, currency: "MXN", pipelineStageId: "s2" },
      { amount: null, currency: "MXN", pipelineStageId: "s2" },
      { amount: 9999, currency: "MXN", pipelineStageId: "s3" },
      { amount: 5000, currency: "MXN", pipelineStageId: "s4" },
    ])!;
    expect(s).toMatchObject({ currency: "MXN", total: 4000, count: 3, otherCurrencies: [] });
    expect(s.byStage).toEqual([
      { id: "s1", name: "Nuevo", count: 1, total: 1000, share: 25 },
      { id: "s2", name: "Propuesta", count: 2, total: 3000, share: 75 },
    ]);
  });
  it("no mezcla monedas: la mayor es la principal y las demás se listan aparte", () => {
    const s = buildPipelineSummary(stages, [
      { amount: 500, currency: "USD", pipelineStageId: "s1" },
      { amount: 2000, currency: "MXN", pipelineStageId: "s1" },
    ])!;
    expect(s.currency).toBe("MXN");
    expect(s.total).toBe(2000);
    expect(s.otherCurrencies).toEqual([{ currency: "USD", total: 500 }]);
  });
  it("sin etapas abiertas no hay resumen; sin oportunidades el total es 0", () => {
    expect(buildPipelineSummary([stages[2]], [])).toBeNull();
    expect(buildPipelineSummary(stages, [])).toMatchObject({ total: 0, count: 0, currency: "MXN" });
  });
});

describe("percentChange", () => {
  it("compara contra el periodo anterior", () => {
    expect(percentChange(15, 10)).toBe(50);
    expect(percentChange(5, 10)).toBe(-50);
    expect(percentChange(10, 10)).toBe(0);
  });
  it("sin base no inventa una variación", () => {
    expect(percentChange(5, 0)).toBeNull();
  });
});
