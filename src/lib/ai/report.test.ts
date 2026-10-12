// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, cleanupOrg } from "@/test/helpers";
import { getAiOverview, getAiHistory, getAiUsageCsv, parseAiFilters, periodRange, csvCell } from "./report";

const NOW = new Date("2030-10-15T18:00:00Z");
const at = (day: number) => new Date(`2030-10-${String(day).padStart(2, "0")}T12:00:00Z`);

describe("filtros y CSV (puros)", () => {
  it("solo acepta periodos y granularidades conocidas; recorta lo demás", () => {
    expect(parseAiFilters({ period: "evil", granularity: "'; DROP", org: "x".repeat(500) })).toMatchObject({ period: "30d", granularity: "day", organizationId: undefined });
    expect(parseAiFilters({ period: "month", granularity: "week", org: "o1", agent: "pipeline" })).toMatchObject({ period: "month", granularity: "week", organizationId: "o1", agentKey: "pipeline" });
    expect(periodRange("month", NOW).from.toISOString()).toBe("2030-10-01T00:00:00.000Z");
    expect(periodRange("7d", NOW).from.getTime()).toBe(NOW.getTime() - 7 * 86_400_000);
  });
  it("las celdas del CSV se escapan y neutralizan fórmulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
    expect(csvCell(12.5)).toBe("12.5");
  });
});

describe("reportes del ledger de IA", () => {
  let a: { id: string };
  let b: { id: string };
  const row = (orgId: string, n: number, o: Record<string, unknown> = {}) =>
    prisma.aiUsage.create({
      data: { organizationId: orgId, agentKey: "inbox:whatsapp", operation: "draft", origin: "whatsapp", provider: "anthropic", model: "m1", requestId: `r${n}-${orgId}`, status: "SUCCEEDED", inputTokens: 1000, outputTokens: 100, costBasis: "ESTIMATED", costOriginal: 0.05, currencyOriginal: "USD", costMxn: 1, createdAt: at(10), ...o } as never,
    });

  beforeAll(async () => {
    a = await createTestOrg("AI Report A");
    b = await createTestOrg("AI Report B");
    await row(a.id, 1, { conversationId: "c1", createdAt: at(10) });
    await row(a.id, 2, { conversationId: "c1", createdAt: at(11), operation: "auto_reply" });
    await row(a.id, 3, { conversationId: "c2", createdAt: at(11), agentKey: "pipeline", model: "m2", costMxn: 2, costOriginal: 0.1 });
    await row(a.id, 4, { status: "FAILED", costBasis: "NO_RATE", costMxn: null, costOriginal: null, currencyOriginal: null, inputTokens: 0, outputTokens: 0, createdAt: at(12) });
    await row(a.id, 5, { costBasis: "NO_RATE", costMxn: null, costOriginal: null, currencyOriginal: null, model: "sin-tarifa", createdAt: at(12) });
    await row(b.id, 6, { costMxn: 10, costOriginal: 0.5, createdAt: at(12) });
    await row(a.id, 7, { createdAt: new Date("2030-08-01T00:00:00Z"), costMxn: 99 }); // fuera del periodo
  });
  afterAll(async () => {
    await cleanupOrg(a.id);
    await cleanupOrg(b.id);
  });

  it("totales reales del periodo, sin contar lo de fuera ni inventar costos de lo que no tiene tarifa", async () => {
    const o = await getAiOverview(parseAiFilters({ period: "30d" }), NOW);
    // Se comparan solo las organizaciones de esta prueba (otros datos de la base de pruebas no deben afectar).
    const mine = (rows: { key: string }[]) => rows.filter((r) => [a.id, b.id].includes(r.key));
    expect(mine(o.byTenant).map((r) => r.key).sort()).toEqual([a.id, b.id].sort());
    const ta = o.byTenant.find((r) => r.key === a.id)!;
    expect(ta).toMatchObject({ calls: 5, costMxn: 4 }); // 1+1+2 (la de agosto no entra; las sin tarifa suman 0)
    expect(o.byTenant.find((r) => r.key === b.id)).toMatchObject({ calls: 1, costMxn: 10 });
    expect(o.byTenant[0].costMxn).toBeGreaterThanOrEqual(o.byTenant[o.byTenant.length - 1].costMxn); // orden por costo
    expect(o.modelsWithoutRate.find((m) => m.model === "sin-tarifa")).toMatchObject({ calls: 1 });
  });

  it("filtra por cliente: el costo de un tenant no se mezcla con el de otro", async () => {
    const o = await getAiOverview(parseAiFilters({ period: "30d", org: a.id }), NOW);
    expect(o.totals).toMatchObject({ calls: 5, failed: 1, noRate: 1, costMxn: 4, conversations: 2 });
    expect(o.totals.costUsd).toBeCloseTo(0.2, 6);
    // Dos conversaciones: c1 (2 llamadas, $2) y c2 (1 llamada, $2) → $2 por conversación.
    expect(o.totals.avgPerConversationMxn).toBe(2);
    expect(o.byTenant).toHaveLength(1);
    expect(o.byAgent.map((r) => r.key).sort()).toEqual(["inbox:whatsapp", "pipeline"]);
    expect(o.byModel.find((r) => r.key === "anthropic:m2")).toMatchObject({ calls: 1, costMxn: 2 });
  });

  it("filtra por agente, modelo y operación; la serie agrupa por día o por mes", async () => {
    const byAgent = await getAiOverview(parseAiFilters({ period: "30d", org: a.id, agent: "pipeline" }), NOW);
    expect(byAgent.totals).toMatchObject({ calls: 1, costMxn: 2 });
    const byOp = await getAiOverview(parseAiFilters({ period: "30d", org: a.id, operation: "auto_reply" }), NOW);
    expect(byOp.totals.calls).toBe(1);
    const daily = await getAiOverview(parseAiFilters({ period: "30d", org: a.id, granularity: "day" }), NOW);
    expect(daily.series.map((s) => s.bucket)).toEqual(["2030-10-10", "2030-10-11", "2030-10-12"]);
    expect(daily.series.find((s) => s.bucket === "2030-10-11")).toMatchObject({ costMxn: 3, calls: 2 });
    const monthly = await getAiOverview(parseAiFilters({ period: "90d", org: a.id, granularity: "month" }), NOW);
    expect(monthly.series.map((s) => s.bucket)).toEqual(["2030-08-01", "2030-10-01"]);
  });

  it("historial paginado y CSV con los mismos filtros", async () => {
    const h = await getAiHistory(parseAiFilters({ period: "30d", org: a.id }), 1, NOW);
    expect(h.total).toBe(5);
    expect(h.rows[0].createdAt.getTime()).toBeGreaterThanOrEqual(h.rows[4].createdAt.getTime());
    expect(h.rows.every((r) => r.organization.startsWith("AI Report A"))).toBe(true);
    const csv = await getAiUsageCsv(parseAiFilters({ period: "30d", org: a.id }), NOW);
    const lines = csv.split("\n");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toContain("costo_mxn");
    expect(csv).not.toContain("AI Report B");
  });
});
