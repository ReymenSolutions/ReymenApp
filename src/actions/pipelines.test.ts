// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, createTestPipelineStages, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createPipeline, renamePipeline, setDefaultPipeline, deletePipeline, createPipelineStage, swapPipelineStageOrder } = await import("./pipeline-stages");
const { createOpportunity, markOpportunityLost, moveOpportunityStage } = await import("./opportunities");
const { stageOptionsFor, getDefaultPipeline } = await import("@/lib/pipelines");
const { getCrmDashboard } = await import("@/lib/crm-dashboard");

describe("Varios embudos (pipelines) por negocio", () => {
  let org: { id: string };
  let owner: { id: string };
  let manager: { id: string };
  let lead: { id: string };
  let salesStages: { id: string; name: string; isLost: boolean }[];

  beforeAll(async () => {
    org = await createTestOrg("Pipelines Org");
    owner = await createTestUser(org.id, "OWNER", "pl-owner");
    manager = await createTestUser(org.id, "MANAGER", "pl-manager");
    salesStages = await createTestPipelineStages(org.id);
    lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Cliente Embudos" } });
  });
  afterAll(async () => cleanupOrg(org.id));

  const asOwner = () => authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));

  it("solo quien administra el pipeline crea embudos", async () => {
    authMock.mockResolvedValue(fakeSession({ id: manager.id, role: "MANAGER", organizationId: org.id }));
    await expect(createPipeline("Renovaciones")).rejects.toThrow(/autorizado/i);
  });

  it("crea un embudo con etapas básicas y una oportunidad sin etapa cae en el principal", async () => {
    asOwner();
    const { pipelineId } = await createPipeline("Renovaciones");
    const stages = await prisma.pipelineStage.findMany({ where: { pipelineId }, orderBy: { order: "asc" } });
    expect(stages.map((s) => s.name)).toEqual(["Nuevo", "En proceso", "Ganado", "Perdido"]);
    expect((await getDefaultPipeline(org.id))?.name).toBe("Ventas");

    const { opportunityId } = await createOpportunity({ leadId: lead.id, title: "Venta nueva" });
    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    expect(opp.pipelineStageId).toBe(salesStages[0].id);

    const options = await stageOptionsFor(org.id);
    expect(options.map((o) => o.name)).toContain("Renovaciones › En proceso");
    expect(options[0].name).toBe("Ventas › Nuevo");
  });

  it("perder una oportunidad la lleva a la etapa «perdida» de su mismo embudo", async () => {
    asOwner();
    const renewals = await prisma.pipeline.findFirstOrThrow({ where: { organizationId: org.id, name: "Renovaciones" }, include: { stages: { orderBy: { order: "asc" } } } });
    const { opportunityId } = await createOpportunity({ leadId: lead.id, title: "Renovación anual", pipelineStageId: renewals.stages[1].id });
    await markOpportunityLost(opportunityId, "Precio");
    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId }, include: { pipelineStage: true } });
    expect(opp.pipelineStage.pipelineId).toBe(renewals.id);
    expect(opp.pipelineStage.isLost).toBe(true);
    expect(opp.closedAt).not.toBeNull();
  });

  it("las etapas se ordenan dentro de su embudo y se pueden agregar al que se elija", async () => {
    asOwner();
    const renewals = await prisma.pipeline.findFirstOrThrow({ where: { organizationId: org.id, name: "Renovaciones" }, include: { stages: { orderBy: { order: "asc" } } } });
    await expect(swapPipelineStageOrder(renewals.stages[0].id, salesStages[1].id)).rejects.toThrow(/embudos distintos/);
    const { stageId } = await createPipelineStage({ name: "Negociación", pipelineId: renewals.id });
    const stage = await prisma.pipelineStage.findUniqueOrThrow({ where: { id: stageId } });
    expect(stage).toMatchObject({ pipelineId: renewals.id, order: 4 });
    // Sin embudo indicado, la etapa va al principal.
    const { stageId: s2 } = await createPipelineStage({ name: "Seguimiento" });
    expect((await prisma.pipelineStage.findUniqueOrThrow({ where: { id: s2 } })).pipelineId).toBe((await getDefaultPipeline(org.id))!.id);
  });

  it("un solo principal; el principal y los embudos con oportunidades no se borran", async () => {
    asOwner();
    const renewals = await prisma.pipeline.findFirstOrThrow({ where: { organizationId: org.id, name: "Renovaciones" } });
    const sales = (await getDefaultPipeline(org.id))!;
    await expect(deletePipeline(sales.id)).rejects.toThrow(/principal/);
    await expect(deletePipeline(renewals.id)).rejects.toThrow(/oportunidades/);

    await setDefaultPipeline(renewals.id);
    const defaults = await prisma.pipeline.findMany({ where: { organizationId: org.id, isDefault: true } });
    expect(defaults.map((p) => p.id)).toEqual([renewals.id]);
    await setDefaultPipeline(sales.id);

    await renamePipeline(renewals.id, "Renovaciones 2027");
    const { pipelineId: emptyId } = await createPipeline("Vacío");
    await deletePipeline(emptyId);
    expect(await prisma.pipeline.findUnique({ where: { id: emptyId } })).toBeNull();
    expect(await prisma.pipelineStage.count({ where: { pipelineId: emptyId } })).toBe(0);
  });

  it("mover una oportunidad a otro embudo funciona y el tablero de inicio no mezcla etapas con el mismo nombre", async () => {
    asOwner();
    const renewals = await prisma.pipeline.findFirstOrThrow({ where: { organizationId: org.id, name: "Renovaciones 2027" }, include: { stages: { orderBy: { order: "asc" } } } });
    const { opportunityId } = await createOpportunity({ leadId: lead.id, title: "Cambia de embudo", amount: 1000 });
    await moveOpportunityStage(opportunityId, renewals.stages[0].id);
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } })).pipelineStageId).toBe(renewals.stages[0].id);
    const dash = await getCrmDashboard(org.id);
    const names = dash.pipeline?.byStage.map((s) => s.name) ?? [];
    expect(names).toContain("Ventas › Nuevo");
    expect(names).toContain("Renovaciones 2027 › Nuevo");
  });
});
