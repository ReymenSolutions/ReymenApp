// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, createTestPipelineStages, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createOpportunity, moveOpportunityStage, markOpportunityLost, updateOpportunity } = await import("./opportunities");

describe("opportunities actions", () => {
  let org: { id: string };
  let owner: { id: string };
  let agent: { id: string };
  let viewer: { id: string };
  let stages: { id: string; name: string; isWon: boolean; isLost: boolean }[];
  let leadId: string;

  beforeAll(async () => {
    org = await createTestOrg("Opportunities Test Org");
    owner = await createTestUser(org.id, "OWNER", "opp-owner");
    agent = await createTestUser(org.id, "AGENT", "opp-agent");
    viewer = await createTestUser(org.id, "VIEWER", "opp-viewer");
    stages = await createTestPipelineStages(org.id);
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Opportunity Lead" } });
    leadId = lead.id;
  });

  afterAll(async () => {
    await cleanupOrg(org.id);
  });

  it("rejects a role without opportunities:create", async () => {
    authMock.mockResolvedValue(fakeSession({ id: viewer.id, role: "VIEWER", organizationId: org.id }));
    await expect(createOpportunity({ leadId, title: "Should fail" })).rejects.toThrow();
  });

  it("creates an opportunity defaulting to the first stage and the caller as owner", async () => {
    authMock.mockResolvedValue(fakeSession({ id: agent.id, role: "AGENT", organizationId: org.id }));
    const result = await createOpportunity({ leadId, title: "New Deal", amount: 5000 });
    expect(result.success).toBe(true);

    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: result.opportunityId } });
    expect(opp.pipelineStageId).toBe(stages[0].id);
    expect(opp.ownerId).toBe(agent.id);
    expect(opp.amount).toBe(5000);
  });

  it("rejects creation for a lead belonging to another organization", async () => {
    const orgB = await createTestOrg("Opportunities Org B");
    const leadB = await prisma.lead.create({ data: { organizationId: orgB.id, name: "Other Org Lead" } });
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));

    await expect(createOpportunity({ leadId: leadB.id, title: "Cross tenant" })).rejects.toThrow();
    await cleanupOrg(orgB.id);
  });

  it("moveOpportunityStage sets closedAt when moving into a won stage", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { opportunityId } = await createOpportunity({ leadId, title: "To Be Won" });
    const wonStage = stages.find((s) => s.isWon)!;

    await moveOpportunityStage(opportunityId, wonStage.id);

    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    expect(opp.pipelineStageId).toBe(wonStage.id);
    expect(opp.closedAt).not.toBeNull();
  });

  it("moveOpportunityStage clears closedAt when moving back to an open stage", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { opportunityId } = await createOpportunity({ leadId, title: "Reopened" });
    const wonStage = stages.find((s) => s.isWon)!;
    const openStage = stages.find((s) => !s.isWon && !s.isLost)!;

    await moveOpportunityStage(opportunityId, wonStage.id);
    await moveOpportunityStage(opportunityId, openStage.id);

    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    expect(opp.closedAt).toBeNull();
  });

  it("markOpportunityLost moves the opportunity to the org's lost stage and records the reason", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { opportunityId } = await createOpportunity({ leadId, title: "To Be Lost" });
    const lostStage = stages.find((s) => s.isLost)!;

    await markOpportunityLost(opportunityId, "Precio muy alto");

    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    expect(opp.pipelineStageId).toBe(lostStage.id);
    expect(opp.lossReason).toBe("Precio muy alto");
    expect(opp.closedAt).not.toBeNull();
  });

  it("logs an audit entry with from/to stage ids on stage change", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { opportunityId } = await createOpportunity({ leadId, title: "Audited Move" });
    const targetStage = stages[1];

    await moveOpportunityStage(opportunityId, targetStage.id);

    const log = await prisma.auditLog.findFirst({
      where: { organizationId: org.id, action: "opportunity.stage_change", resourceId: opportunityId },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect((log?.metadata as { toStageId?: string })?.toStageId).toBe(targetStage.id);
  });

  it("updateOpportunity updates fields without touching the stage", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { opportunityId } = await createOpportunity({ leadId, title: "Editable" });

    await updateOpportunity({ opportunityId, title: "Renamed Deal", amount: 12000 });

    const opp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opportunityId } });
    expect(opp.title).toBe("Renamed Deal");
    expect(opp.amount).toBe(12000);
  });

  it("enforces tenant isolation: org B cannot move org A's opportunity", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const { opportunityId } = await createOpportunity({ leadId, title: "Isolated Deal" });

    const orgB = await createTestOrg("Opportunities Isolation Org B");
    const ownerB = await createTestUser(orgB.id, "OWNER", "opp-owner-b");
    authMock.mockResolvedValue(fakeSession({ id: ownerB.id, role: "OWNER", organizationId: orgB.id }));

    await expect(moveOpportunityStage(opportunityId, stages[1].id)).rejects.toThrow();

    await cleanupOrg(orgB.id);
  });

  it("blocks creating an opportunity when the CRM module is suspended", async () => {
    const orgC = await createTestOrg("Opportunities Suspended Org");
    await prisma.organizationModule.update({
      where: { organizationId_module: { organizationId: orgC.id, module: "CRM" } },
      data: { status: "SUSPENDED" },
    });
    const ownerC = await createTestUser(orgC.id, "OWNER", "opp-owner-c");
    const leadC = await prisma.lead.create({ data: { organizationId: orgC.id, name: "Suspended Org Lead" } });
    authMock.mockResolvedValue(fakeSession({ id: ownerC.id, role: "OWNER", organizationId: orgC.id }));

    await expect(createOpportunity({ leadId: leadC.id, title: "Should not be created" })).rejects.toThrow(/módulo/i);

    await cleanupOrg(orgC.id);
  });

  it("moving an opportunity updates the contact's status through the pipeline (and the lead page shows one status)", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Estado único" } });
    const { opportunityId } = await createOpportunity({ leadId: lead.id, title: "Venta única" });
    const proposal = stages.find((s) => s.name === "Propuesta")!;
    const won = stages.find((s) => s.isWon)!;

    await moveOpportunityStage(opportunityId, proposal.id);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("PROPOSAL");
    await moveOpportunityStage(opportunityId, won.id);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("WON");
  });

  it("markOpportunityLost marks the lead as lost when it was its only open opportunity", async () => {
    authMock.mockResolvedValue(fakeSession({ id: owner.id, role: "OWNER", organizationId: org.id }));
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Pierde única" } });
    const { opportunityId } = await createOpportunity({ leadId: lead.id, title: "Única" });
    await markOpportunityLost(opportunityId, "Muy caro");
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("LOST");
  });
});
