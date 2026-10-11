// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestPipelineStages, cleanupOrg } from "@/test/helpers";
import { average, getCrmReport, median, normalizeText, parseReportRange, rangeStart } from "./crm-reports";

const DAY = 24 * 3600_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

describe("pure helpers", () => {
  it("median and average", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([1, 9, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
    expect(average([])).toBeNull();
    expect(average([2, 4])).toBe(3);
  });
  it("normalizes hand-typed text and parses the range", () => {
    expect(normalizeText("  Muy   caro ")).toBe("Muy caro");
    expect(normalizeText("   ")).toBeNull();
    expect(normalizeText(null)).toBeNull();
    expect(parseReportRange("30")).toBe("30");
    expect(parseReportRange("all")).toBe("all");
    expect(parseReportRange("7")).toBe("90");
    expect(parseReportRange(undefined)).toBe("90");
    expect(rangeStart("all")).toBeNull();
    expect(rangeStart("30", new Date("2026-10-31T00:00:00Z"))?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});

describe("getCrmReport", () => {
  const orgs: string[] = [];
  afterEach(async () => {
    for (const id of orgs.splice(0)) {
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await cleanupOrg(id);
    }
  });
  async function setup() {
    const org = await createTestOrg("Report Org");
    orgs.push(org.id);
    const stages = await createTestPipelineStages(org.id);
    const st = Object.fromEntries(stages.map((s) => [s.name, s]));
    return { org, st };
  }
  const lead = (organizationId: string, name: string, data: Record<string, unknown> = {}) => prisma.lead.create({ data: { organizationId, name, ...data } });

  it("tells where the buyers come from: per source (any casing), conversion and money per currency", async () => {
    const { org, st } = await setup();
    const a = await lead(org.id, "A", { source: "WhatsApp", status: "WON" });
    await lead(org.id, "B", { source: "whatsapp", status: "NEW" });
    await lead(org.id, "C", { source: "WHATSAPP ", status: "LOST" });
    const d = await lead(org.id, "D", { source: "Instagram", status: "WON" });
    await lead(org.id, "E", { source: null, status: "NEW" });
    await prisma.opportunity.create({ data: { organizationId: org.id, leadId: a.id, pipelineStageId: st["Ganado"].id, title: "Venta A", amount: 1000, currency: "MXN", closedAt: new Date() } });
    await prisma.opportunity.create({ data: { organizationId: org.id, leadId: a.id, pipelineStageId: st["Ganado"].id, title: "Venta A2", amount: 50, currency: "USD", closedAt: new Date() } });
    await prisma.opportunity.create({ data: { organizationId: org.id, leadId: d.id, pipelineStageId: st["Ganado"].id, title: "Venta D", amount: 500, currency: "MXN", closedAt: new Date() } });
    await prisma.opportunity.create({ data: { organizationId: org.id, leadId: d.id, pipelineStageId: st["Nuevo"].id, title: "Abierta", amount: 9999, currency: "MXN" } }); // no es dinero ganado

    const { sources } = await getCrmReport(org.id, "all");
    const wa = sources.find((s) => s.source?.toLowerCase().startsWith("whatsapp"))!;
    expect(wa).toMatchObject({ leads: 3, won: 1, lost: 1 });
    expect(wa.conversion).toBeCloseTo(1 / 3);
    expect(wa.revenue).toEqual([{ currency: "MXN", amount: 1000 }, { currency: "USD", amount: 50 }]);
    const ig = sources.find((s) => s.source === "Instagram")!;
    expect(ig).toMatchObject({ leads: 1, won: 1, conversion: 1 });
    expect(ig.revenue).toEqual([{ currency: "MXN", amount: 500 }]);
    expect(sources.find((s) => s.source === null)).toMatchObject({ leads: 1, won: 0 });
    expect(sources).toHaveLength(3);
    expect(sources[0].won).toBeGreaterThanOrEqual(sources[1].won); // más compradores primero
  });

  it("respects the period for new leads", async () => {
    const { org } = await setup();
    await lead(org.id, "Reciente", { source: "Web", createdAt: ago(5) });
    await lead(org.id, "Viejo", { source: "Web", createdAt: ago(200) });
    expect((await getCrmReport(org.id, "30")).sources[0].leads).toBe(1);
    expect((await getCrmReport(org.id, "365")).sources[0].leads).toBe(2);
  });

  it("measures how long they take to close (from the lead and from the opportunity)", async () => {
    const { org, st } = await setup();
    const mk = async (leadAge: number, oppAge: number, closedAgo: number) => {
      const l = await lead(org.id, `L${leadAge}`, { createdAt: ago(leadAge) });
      await prisma.opportunity.create({ data: { organizationId: org.id, leadId: l.id, pipelineStageId: st["Ganado"].id, title: "V", createdAt: ago(oppAge), closedAt: ago(closedAgo) } });
    };
    await mk(20, 10, 0); // 20 días desde el lead, 10 desde la oportunidad
    await mk(40, 30, 0); // 40 y 30
    await mk(60, 50, 0); // 60 y 50
    await mk(100, 90, 80); // cerró hace 80 días: fuera de 30 días
    const r = await getCrmReport(org.id, "30");
    expect(r.closing.count).toBe(3);
    expect(r.closing.avgDaysFromLead).toBeCloseTo(40, 0);
    expect(r.closing.medianDaysFromLead).toBeCloseTo(40, 0);
    expect(r.closing.medianDaysFromOpportunity).toBeCloseTo(30, 0);
    const all = await getCrmReport(org.id, "all");
    expect(all.closing.count).toBe(4);
  });

  it("explains why and where they fall: normalized reasons, and the stage they were in", async () => {
    const { org, st } = await setup();
    const l = await lead(org.id, "Con pérdidas");
    const mkLost = (reason: string | null) =>
      prisma.opportunity.create({ data: { organizationId: org.id, leadId: l.id, pipelineStageId: st["Perdido"].id, title: "Perdida", lossReason: reason, closedAt: new Date() } });
    const o1 = await mkLost("Muy caro");
    const o2 = await mkLost("muy  caro ");
    const o3 = await mkLost("Se fue con la competencia");
    const o4 = await mkLost(null);
    await prisma.opportunity.create({ data: { organizationId: org.id, leadId: l.id, pipelineStageId: st["Ganado"].id, title: "No cuenta", closedAt: new Date() } });

    const audit = (action: string, resourceId: string, metadata: object) => prisma.auditLog.create({ data: { organizationId: org.id, action, resource: "Opportunity", resourceId, metadata } });
    await audit("opportunity.stage_change", o1.id, { fromStageId: st["Propuesta"].id, toStageId: st["Perdido"].id, toStageName: "Perdido" });
    await audit("opportunity.lost", o2.id, { lossReason: "muy caro", fromStageName: "Propuesta" });
    await audit("opportunity.lost", o3.id, { lossReason: "x" }); // sin etapa de origen (registro antiguo)
    await audit("opportunity.stage_change", o4.id, { fromStageId: st["Nuevo"].id, toStageId: st["Contactado"].id, toStageName: "Contactado" }); // no es una pérdida

    const { losses } = await getCrmReport(org.id, "all");
    expect(losses.total).toBe(4);
    expect(losses.reasons[0]).toMatchObject({ count: 2 });
    expect(losses.reasons[0].reason?.toLowerCase().replace(/\s+/g, " ")).toBe("muy caro");
    expect(losses.reasons.some((r) => r.reason === null && r.count === 1)).toBe(true);
    expect(losses.fromStage).toEqual([{ stage: "Propuesta", count: 2 }]);
    expect(losses.fromStageKnown).toBe(2);
  });

  it("never mixes organizations and handles an empty account", async () => {
    const { org } = await setup();
    const other = await createTestOrg("Report Other");
    orgs.push(other.id);
    await lead(other.id, "De otra", { source: "Web", status: "WON" });
    const r = await getCrmReport(org.id, "all");
    expect(r.sources).toEqual([]);
    expect(r.closing).toMatchObject({ count: 0, avgDaysFromLead: null, medianDaysFromLead: null });
    expect(r.losses).toEqual({ total: 0, reasons: [], fromStage: [], fromStageKnown: 0 });
  });
});
