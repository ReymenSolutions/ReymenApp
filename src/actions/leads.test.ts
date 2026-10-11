// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, fakeSession, cleanupOrg } from "@/test/helpers";
import { monthPeriod, METRIC_KEYS } from "@/lib/metrics";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createLead, updateLeadStatus, deleteLead, updateLeadTags, checkLeadDuplicates, mergeLeads, searchLeads, setLeadDoNotContact } = await import("./leads");

describe("leads actions", () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let userA: { id: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Leads Test Org A");
    orgB = await createTestOrg("Leads Test Org B");
    userA = await createTestUser(orgA.id, "OWNER", "leads-owner-a");
  });

  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });

  it("rejects createLead with no session", async () => {
    authMock.mockResolvedValue(null);
    const fd = new FormData();
    fd.set("name", "Nobody");
    await expect(createLead(fd)).rejects.toThrow();
  });

  it("creates a lead scoped to the caller's organization", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "Ana García");
    fd.set("email", "ana@example.com");
    const result = await createLead(fd);
    expect(result.success).toBe(true);

    const lead = await prisma.lead.findUnique({ where: { id: result.leadId } });
    expect(lead?.organizationId).toBe(orgA.id);
    expect(lead?.name).toBe("Ana García");

    const metric = await prisma.metric.findUnique({
      where: { organizationId_key_period: { organizationId: orgA.id, key: METRIC_KEYS.LEADS_CAPTURED, period: monthPeriod() } },
    });
    expect(metric?.value).toBeGreaterThanOrEqual(1);
  });

  it("rejects an empty name", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "");
    await expect(createLead(fd)).rejects.toThrow();
  });

  it("treats an empty email as absent rather than an invalid email (regression)", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "No Email Lead");
    fd.set("email", "");
    const result = await createLead(fd);
    expect(result.success).toBe(true);
    const lead = await prisma.lead.findUnique({ where: { id: result.leadId } });
    expect(lead?.email).toBeNull();
  });

  it("enforces tenant isolation: org B cannot update or delete org A's lead", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "Isolation Target");
    const { leadId } = await createLead(fd);

    const userB = await createTestUser(orgB.id, "OWNER", "leads-owner-b");
    authMock.mockResolvedValue(fakeSession({ id: userB.id, role: "OWNER", organizationId: orgB.id }));

    await expect(updateLeadStatus(leadId, "WON")).rejects.toThrow();
    await expect(deleteLead(leadId)).rejects.toThrow();

    const stillThere = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(stillThere?.status).toBe("NEW");
    expect(stillThere?.deletedAt).toBeNull();
  });

  it("records a status change in the audit log (who, from, to) and ignores a no-op change", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "Status History");
    const { leadId } = await createLead(fd);

    await updateLeadStatus(leadId, "CONTACTED");
    await updateLeadStatus(leadId, "CONTACTED"); // mismo estado: no es un cambio
    await updateLeadStatus(leadId, "QUALIFIED");

    const logs = await prisma.auditLog.findMany({ where: { resource: "Lead", resourceId: leadId, action: "lead.status_change" }, orderBy: { createdAt: "asc" } });
    expect(logs.map((l) => l.metadata)).toEqual([
      { from: "NEW", to: "CONTACTED" },
      { from: "CONTACTED", to: "QUALIFIED" },
    ]);
    expect(logs[0].userId).toBe(userA.id);
  });

  it("soft-deletes a lead (deletedAt set, row not removed)", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "To Be Deleted");
    const { leadId } = await createLead(fd);

    await deleteLead(leadId);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    expect(lead).not.toBeNull();
    expect(lead?.deletedAt).not.toBeNull();
  });

  it("blocks creating a lead once the org's plan limit is reached", async () => {
    const orgC = await createTestOrg("Leads Plan Limit Org");
    await prisma.organization.update({ where: { id: orgC.id }, data: { plan: "starter" } });
    const userC = await createTestUser(orgC.id, "OWNER", "leads-owner-c");
    authMock.mockResolvedValue(fakeSession({ id: userC.id, role: "OWNER", organizationId: orgC.id }));

    await prisma.lead.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        organizationId: orgC.id,
        name: `Lead ${i}`,
        source: "manual",
      })),
    });

    const fd = new FormData();
    fd.set("name", "One Too Many");
    await expect(createLead(fd)).rejects.toThrow(/límite de leads/);

    await cleanupOrg(orgC.id);
  });

  it("blocks creating a lead when the org's CRM module is suspended, even for a role that has leads:create", async () => {
    const orgD = await createTestOrg("Leads Module Suspended Org");
    await prisma.organizationModule.update({
      where: { organizationId_module: { organizationId: orgD.id, module: "CRM" } },
      data: { status: "SUSPENDED" },
    });
    const userD = await createTestUser(orgD.id, "OWNER", "leads-owner-d");
    authMock.mockResolvedValue(fakeSession({ id: userD.id, role: "OWNER", organizationId: orgD.id }));

    const fd = new FormData();
    fd.set("name", "Should Not Be Created");
    await expect(createLead(fd)).rejects.toThrow(/módulo/i);

    const count = await prisma.lead.count({ where: { organizationId: orgD.id } });
    expect(count).toBe(0);

    await cleanupOrg(orgD.id);
  });

  it("createLead flags a same-phone lead as a non-blocking duplicate without preventing creation", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd1 = new FormData();
    fd1.set("name", "Original Contact");
    fd1.set("phone", "555-0100");
    const first = await createLead(fd1);
    expect(first.duplicates).toEqual([]);

    const fd2 = new FormData();
    fd2.set("name", "Same Phone Different Name");
    fd2.set("phone", "(555) 0100");
    const second = await createLead(fd2);
    expect(second.success).toBe(true);
    expect(second.duplicates.map((d) => d.id)).toContain(first.leadId);
  });

  it("checkLeadDuplicates matches by normalized email regardless of case", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd1 = new FormData();
    fd1.set("name", "Email Match A");
    fd1.set("email", "Person@Example.com");
    const a = await createLead(fd1);

    const fd2 = new FormData();
    fd2.set("name", "Email Match B");
    fd2.set("email", "person@example.com");
    const b = await createLead(fd2);

    const duplicates = await checkLeadDuplicates(b.leadId);
    expect(duplicates.map((d) => d.id)).toContain(a.leadId);
  });

  it("updateLeadTags dedupes and trims tags", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "Tag Target");
    const { leadId } = await createLead(fd);

    await updateLeadTags(leadId, ["  vip ", "vip", "urgente", ""]);
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    expect(lead.tags.sort()).toEqual(["urgente", "vip"]);
  });

  it("searchLeads finds a lead by partial name match, scoped to the caller's org", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "Zulema Buscar");
    await createLead(fd);

    const results = await searchLeads("Zulema");
    expect(results.some((r) => r.name === "Zulema Buscar")).toBe(true);
  });

  it("mergeLeads moves opportunities/notes/appointments to the primary and soft-deletes the duplicate", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fdPrimary = new FormData();
    fdPrimary.set("name", "Primary Lead");
    fdPrimary.set("phone", "555-9999");
    const primary = await createLead(fdPrimary);

    const fdDup = new FormData();
    fdDup.set("name", "Duplicate Lead");
    fdDup.set("email", "dup@example.com");
    const duplicate = await createLead(fdDup);

    await prisma.pipelineStage.create({ data: { organizationId: orgA.id, name: "Merge Test Stage", order: 900 } });
    const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { organizationId: orgA.id, name: "Merge Test Stage" } });
    const opp = await prisma.opportunity.create({
      data: { organizationId: orgA.id, leadId: duplicate.leadId, pipelineStageId: stage.id, title: "Deal on duplicate" },
    });
    const note = await prisma.note.create({
      data: { organizationId: orgA.id, leadId: duplicate.leadId, content: "Note on duplicate" },
    });

    const result = await mergeLeads(primary.leadId, duplicate.leadId);
    expect(result.success).toBe(true);

    const movedOpp = await prisma.opportunity.findUniqueOrThrow({ where: { id: opp.id } });
    expect(movedOpp.leadId).toBe(primary.leadId);
    const movedNote = await prisma.note.findUniqueOrThrow({ where: { id: note.id } });
    expect(movedNote.leadId).toBe(primary.leadId);

    const primaryLead = await prisma.lead.findUniqueOrThrow({ where: { id: primary.leadId } });
    expect(primaryLead.email).toBe("dup@example.com");

    const dupLead = await prisma.lead.findUniqueOrThrow({ where: { id: duplicate.leadId } });
    expect(dupLead.deletedAt).not.toBeNull();
  });

  it("mergeLeads also moves conversations and follow-up history, backfills the phone key and keeps 'do not contact'", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fdPrimary = new FormData();
    fdPrimary.set("name", "Primary Full");
    const primary = await createLead(fdPrimary);
    const fdDup = new FormData();
    fdDup.set("name", "Duplicate Full");
    fdDup.set("phone", "+52 1 55 4444 5555");
    const duplicate = await createLead(fdDup);
    await prisma.lead.update({ where: { id: duplicate.leadId }, data: { doNotContact: true } });

    const conv = await prisma.conversation.create({
      data: { organizationId: orgA.id, channel: "whatsapp", contactPhone: "+52 1 55 4444 5555", phoneKey: "5544445555", leadId: duplicate.leadId },
    });
    const rule = await prisma.followUpRule.create({ data: { organizationId: orgA.id, name: "Regla merge", triggerStatus: "NEW", delayMinutes: 10, template: "Hola" } });
    const log = await prisma.followUpLog.create({ data: { leadId: duplicate.leadId, ruleId: rule.id } });

    await mergeLeads(primary.leadId, duplicate.leadId);

    expect((await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id } })).leadId).toBe(primary.leadId);
    expect((await prisma.followUpLog.findUniqueOrThrow({ where: { id: log.id } })).leadId).toBe(primary.leadId);
    const merged = await prisma.lead.findUniqueOrThrow({ where: { id: primary.leadId } });
    expect(merged.phoneKey).toBe("5544445555");
    expect(merged.doNotContact).toBe(true);
  });

  it("enforces tenant isolation: org B cannot merge org A's leads", async () => {
    authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
    const fd1 = new FormData();
    fd1.set("name", "Iso Merge Primary");
    const p1 = await createLead(fd1);
    const fd2 = new FormData();
    fd2.set("name", "Iso Merge Duplicate");
    const p2 = await createLead(fd2);

    const userB = await createTestUser(orgB.id, "OWNER", "leads-merge-owner-b");
    authMock.mockResolvedValue(fakeSession({ id: userB.id, role: "OWNER", organizationId: orgB.id }));

    await expect(mergeLeads(p1.leadId, p2.leadId)).rejects.toThrow();
  });

  describe("setLeadDoNotContact", () => {
    it("toggles the opt-out flag on and off", async () => {
      authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
      const fd = new FormData();
      fd.set("name", "Opt Out Target");
      const { leadId } = await createLead(fd);

      await setLeadDoNotContact(leadId, true);
      let lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      expect(lead.doNotContact).toBe(true);

      await setLeadDoNotContact(leadId, false);
      lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      expect(lead.doNotContact).toBe(false);
    });

    it("enforces tenant isolation: org B cannot opt out org A's lead", async () => {
      authMock.mockResolvedValue(fakeSession({ id: userA.id, role: "OWNER", organizationId: orgA.id }));
      const fd = new FormData();
      fd.set("name", "Isolated Opt Out");
      const { leadId } = await createLead(fd);

      const userB = await createTestUser(orgB.id, "OWNER", "leads-optout-owner-b");
      authMock.mockResolvedValue(fakeSession({ id: userB.id, role: "OWNER", organizationId: orgB.id }));

      await expect(setLeadDoNotContact(leadId, true)).rejects.toThrow();

      const stillThere = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      expect(stillThere.doNotContact).toBe(false);
    });
  });
});
