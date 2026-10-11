// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import type { LeadStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestPipelineStages, cleanupOrg } from "@/test/helpers";
import { nextLeadStatus, stageLeadStatus, syncLeadStatusFromOpportunity } from "./lead-status-sync";

describe("nextLeadStatus", () => {
  const cases: [LeadStatus, LeadStatus, boolean, LeadStatus | null][] = [
    // etapas abiertas: solo avanza
    ["NEW", "CONTACTED", false, "CONTACTED"],
    ["NEW", "PROPOSAL", false, "PROPOSAL"],
    ["QUALIFIED", "CONTACTED", false, null],
    ["PROPOSAL", "NEW", false, null],
    ["CONTACTED", "CONTACTED", false, null],
    // ganada
    ["NEW", "WON", false, "WON"],
    ["PROPOSAL", "WON", true, "WON"],
    ["LOST", "WON", false, "WON"],
    ["WON", "WON", false, null],
    // perdida: solo si no quedan otras abiertas y no estaba ganado
    ["PROPOSAL", "LOST", false, "LOST"],
    ["PROPOSAL", "LOST", true, null],
    ["WON", "LOST", false, null],
    ["LOST", "LOST", false, null],
    // reactivar / no retroceder de ganado
    ["LOST", "NEW", false, "NEW"],
    ["LOST", "PROPOSAL", false, "PROPOSAL"],
    ["WON", "NEW", false, null],
    ["WON", "PROPOSAL", false, null],
  ];
  it.each(cases)("%s + etapa → %s (otras abiertas: %s) = %s", (current, target, hasOther, expected) => {
    expect(nextLeadStatus(current, target, { hasOtherOpenOpportunities: hasOther })).toBe(expected);
  });
});

describe("stageLeadStatus", () => {
  it("uses the configured status, falling back to won/lost flags, else nothing", () => {
    expect(stageLeadStatus({ leadStatus: "QUALIFIED", isWon: false, isLost: false })).toBe("QUALIFIED");
    expect(stageLeadStatus({ leadStatus: null, isWon: true, isLost: false })).toBe("WON");
    expect(stageLeadStatus({ leadStatus: null, isWon: false, isLost: true })).toBe("LOST");
    expect(stageLeadStatus({ leadStatus: null, isWon: false, isLost: false })).toBeNull();
    expect(stageLeadStatus({ leadStatus: "NEW", isWon: true, isLost: false })).toBe("NEW"); // lo configurado manda
  });
});

describe("syncLeadStatusFromOpportunity", () => {
  const orgs: string[] = [];
  afterEach(async () => {
    for (const id of orgs.splice(0)) {
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await cleanupOrg(id);
    }
  });

  async function setup(status: LeadStatus = "NEW") {
    const org = await createTestOrg("Sync Org");
    orgs.push(org.id);
    const stages = await createTestPipelineStages(org.id);
    const by = Object.fromEntries(stages.map((s) => [s.name, s.id]));
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Contacto", status } });
    const opp = (stage: string, extra: Record<string, unknown> = {}) =>
      prisma.opportunity.create({ data: { organizationId: org.id, leadId: lead.id, pipelineStageId: by[stage], title: `Opp ${stage}`, ...extra } });
    const status_ = async () => (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).status;
    return { org, by, lead, opp, status_ };
  }

  it("a new opportunity in a later stage advances the lead and logs it as coming from the pipeline", async () => {
    const { org, lead, opp, status_ } = await setup();
    const o = await opp("Propuesta");
    expect(await syncLeadStatusFromOpportunity({ organizationId: org.id, opportunityId: o.id })).toBe("PROPOSAL");
    expect(await status_()).toBe("PROPOSAL");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { resourceId: lead.id, action: "lead.status_change" } });
    expect(log.metadata).toMatchObject({ from: "NEW", to: "PROPOSAL", via: "pipeline", opportunityId: o.id });
  });

  it("winning an opportunity marks the lead as won, and it doesn't go back if a later one opens in an early stage", async () => {
    const { org, opp, status_ } = await setup("PROPOSAL");
    const won = await opp("Ganado", { closedAt: new Date() });
    await syncLeadStatusFromOpportunity({ organizationId: org.id, opportunityId: won.id });
    expect(await status_()).toBe("WON");

    const second = await opp("Nuevo");
    await syncLeadStatusFromOpportunity({ organizationId: org.id, opportunityId: second.id });
    expect(await status_()).toBe("WON");
  });

  it("losing an opportunity marks the lead lost only when it was the last open one", async () => {
    const { org, opp, status_ } = await setup("PROPOSAL");
    const a = await opp("Propuesta");
    const b = await opp("Calificado");
    const lostA = await prisma.opportunity.update({ where: { id: a.id }, data: { pipelineStageId: (await prisma.pipelineStage.findFirstOrThrow({ where: { organizationId: org.id, isLost: true } })).id, closedAt: new Date() } });
    await syncLeadStatusFromOpportunity({ organizationId: org.id, opportunityId: lostA.id });
    expect(await status_()).toBe("PROPOSAL"); // aún queda b abierta

    const lostStage = await prisma.pipelineStage.findFirstOrThrow({ where: { organizationId: org.id, isLost: true } });
    await prisma.opportunity.update({ where: { id: b.id }, data: { pipelineStageId: lostStage.id, closedAt: new Date() } });
    await syncLeadStatusFromOpportunity({ organizationId: org.id, opportunityId: b.id });
    expect(await status_()).toBe("LOST");
  });

  it("a lost contact is reactivated when it opens a new opportunity", async () => {
    const { org, opp, status_ } = await setup("LOST");
    const o = await opp("Contactado");
    await syncLeadStatusFromOpportunity({ organizationId: org.id, opportunityId: o.id });
    expect(await status_()).toBe("CONTACTED");
  });

  it("a stage with no mapping doesn't change the lead, and nothing is logged when nothing changes", async () => {
    const { org, by, opp, lead, status_ } = await setup("CONTACTED");
    await prisma.pipelineStage.update({ where: { id: by["Calificado"] }, data: { leadStatus: null } });
    const o = await opp("Calificado");
    expect(await syncLeadStatusFromOpportunity({ organizationId: org.id, opportunityId: o.id })).toBeNull();
    expect(await status_()).toBe("CONTACTED");
    expect(await prisma.auditLog.count({ where: { resourceId: lead.id, action: "lead.status_change" } })).toBe(0);
  });

  it("ignores deleted leads and opportunities of another organization", async () => {
    const { org, opp, lead, status_ } = await setup();
    const other = await createTestOrg("Sync Other");
    orgs.push(other.id);
    const o = await opp("Propuesta");
    expect(await syncLeadStatusFromOpportunity({ organizationId: other.id, opportunityId: o.id })).toBeNull();
    expect(await status_()).toBe("NEW");
    await prisma.lead.update({ where: { id: lead.id }, data: { deletedAt: new Date() } });
    expect(await syncLeadStatusFromOpportunity({ organizationId: org.id, opportunityId: o.id })).toBeNull();
  });
});
