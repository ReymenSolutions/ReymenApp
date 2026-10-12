// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestPipelineStages, cleanupOrg } from "@/test/helpers";
import { getRoiData } from "./roi";
import { resetExchangeRateCache } from "./exchange-rate";

describe("getRoiData", () => {
  let org: { id: string } | undefined;

  // Sin red en las pruebas: la fuente automática "falla" y se usa MXN_PER_USD
  // como respaldo, salvo en la prueba que simula la fuente automática.
  beforeEach(() => {
    resetExchangeRateCache();
    // Los precios de plan son en MXN y el ROI los convierte a USD: tipo de cambio fijo para que las cuentas sean exactas.
    vi.stubEnv("MXN_PER_USD", "20");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  });

  afterEach(async () => {
    if (org) await cleanupOrg(org.id);
    org = undefined;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reports no won deals when the org has none", async () => {
    org = await createTestOrg("Roi No Deals Org");
    const data = await getRoiData(org.id, "starter");
    expect(data.hasWonDeals).toBe(false);
    expect(data.totalWonOpportunities).toBe(0);
    expect(data.totalRevenue).toBe(0);
    expect(data.avgDealValue).toBe(0);
  });

  it("only counts opportunities sitting in a won pipeline stage", async () => {
    org = await createTestOrg("Roi Won Only Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const openStage = stages.find((s) => s.order === 0)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });

    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Won Deal", amount: 1000, currency: "USD", closedAt: new Date() },
    });
    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: openStage.id, title: "Open Deal", amount: 5000 },
    });

    const data = await getRoiData(org.id, "starter");
    expect(data.hasWonDeals).toBe(true);
    expect(data.totalWonOpportunities).toBe(1);
    expect(data.totalRevenue).toBe(1000);
    expect(data.avgDealValue).toBe(1000);
  });

  it("excludes won opportunities without an amount set", async () => {
    org = await createTestOrg("Roi No Amount Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });

    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "No amount", closedAt: new Date() },
    });

    const data = await getRoiData(org.id, "starter");
    expect(data.hasWonDeals).toBe(false);
    expect(data.totalWonOpportunities).toBe(0);
  });

  it("only counts closedAt within the last 30 days toward the last30 figures", async () => {
    org = await createTestOrg("Roi Last30 Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Recent Win", amount: 2000, currency: "USD", closedAt: new Date() },
    });
    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Old Win", amount: 8000, currency: "USD", closedAt: sixtyDaysAgo },
    });

    const data = await getRoiData(org.id, "starter");
    expect(data.totalWonOpportunities).toBe(2);
    expect(data.totalRevenue).toBe(10000);
    expect(data.last30WonOpportunities).toBe(1);
    expect(data.last30Revenue).toBe(2000);
  });

  it("uses the real plan cost and computes ROI off last-30-days revenue", async () => {
    org = await createTestOrg("Roi Plan Cost Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });

    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Win", amount: 1000, currency: "USD", closedAt: new Date() },
    });

    const data = await getRoiData(org.id, "professional");
    // $1,999 MXN a 20 pesos por dólar.
    expect(data.planCostMxn).toBe(1999);
    expect(data.planCost).toBe(99.95);
    expect(data.roi).toBe(Math.round(((1000 - 99.95) / 99.95) * 100));
  });

  it("falls back to the starter price for an unknown plan value", async () => {
    org = await createTestOrg("Roi Unknown Plan Org");
    const data = await getRoiData(org.id, "not-a-real-plan");
    expect(data.planCostMxn).toBe(999);
    expect(data.planCost).toBe(49.95);
  });
  it("converts MXN opportunities to USD with the MXN_PER_USD fallback when the automatic source is down", async () => {
    vi.stubEnv("MXN_PER_USD", "20");
    org = await createTestOrg("Roi Mxn Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });

    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Pesos", amount: 20000, currency: "MXN", closedAt: new Date() },
    });
    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Dólares", amount: 500, currency: "USD", closedAt: new Date() },
    });

    const data = await getRoiData(org.id, "starter");
    // $20,000 MXN / 20 = $1,000 USD, más $500 USD.
    expect(data.last30Revenue).toBe(1500);
    expect(data.totalWonOpportunities).toBe(2);
    expect(data.mxnPerUsd).toBe(20);
    expect(data.unconvertedOpportunities).toBe(0);
    expect(data.roi).toBe(Math.round(((1500 - 49.95) / 49.95) * 100));
  });

  it("leaves MXN opportunities out of the totals, and reports them, when no exchange rate is available", async () => {
    vi.stubEnv("MXN_PER_USD", "");
    org = await createTestOrg("Roi No Rate Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });

    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Pesos", amount: 20000, currency: "MXN", closedAt: new Date() },
    });
    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Dólares", amount: 500, currency: "USD", closedAt: new Date() },
    });

    const data = await getRoiData(org.id, "starter");
    expect(data.last30Revenue).toBe(500);
    expect(data.totalWonOpportunities).toBe(1);
    expect(data.mxnPerUsd).toBeNull();
    expect(data.unconvertedOpportunities).toBe(1);
  });

  it("uses the automatic exchange rate when the source responds", async () => {
    vi.stubEnv("BANXICO_TOKEN", "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ date: "2026-09-29", rates: { MXN: 25 } }), { status: 200 }))
    );
    org = await createTestOrg("Roi Auto Rate Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });
    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Pesos", amount: 25000, currency: "MXN", closedAt: new Date() },
    });

    const data = await getRoiData(org.id, "starter");
    expect(data.last30Revenue).toBe(1000);
    expect(data.mxnPerUsd).toBe(25);
    expect(data.rateSource).toBe("frankfurter");
    expect(data.rateDate).toBe("2026-09-29");
  });

  it("uses the org's agreed price for a custom-priced plan, and reports no ROI until one is set", async () => {
    org = await createTestOrg("Roi Custom Price Org");
    const stages = await createTestPipelineStages(org.id);
    const wonStage = stages.find((s) => s.isWon)!;
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Roi Lead" } });
    await prisma.opportunity.create({
      data: { organizationId: org.id, leadId: lead.id, pipelineStageId: wonStage.id, title: "Win", amount: 3000, currency: "USD", closedAt: new Date() },
    });

    // Sin precio pactado paga el de lista del plan ($3,999 MXN = $200 USD a 20 pesos por dólar).
    let data = await getRoiData(org.id, "business");
    expect(data.planCostMxn).toBe(3999);
    expect(data.planCost).toBe(199.95);

    // Con precio pactado en MXN (plan personalizado de este cliente) se usa ese.
    await prisma.organization.update({ where: { id: org.id }, data: { customMonthlyPriceMxn: 30000 } });
    data = await getRoiData(org.id, "business");
    expect(data.planCostMxn).toBe(30000);
    expect(data.planCost).toBe(1500);
    expect(data.roi).toBe(100);
  });
});
