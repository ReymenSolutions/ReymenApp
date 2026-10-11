// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, createTestPipelineStages, cleanupOrg } from "@/test/helpers";
import { getLeadTimeline } from "./lead-timeline";

const ago = (mins: number) => new Date(Date.now() - mins * 60_000);

describe("getLeadTimeline", () => {
  const orgs: string[] = [];
  afterEach(async () => {
    for (const id of orgs.splice(0)) {
      await prisma.auditLog.deleteMany({ where: { organizationId: id } });
      await cleanupOrg(id);
    }
  });

  async function setup() {
    const org = await createTestOrg("Timeline Org");
    orgs.push(org.id);
    await createTestPipelineStages(org.id);
    const user = await createTestUser(org.id, "OWNER", "timeline-owner");
    const lead = await prisma.lead.create({
      data: { organizationId: org.id, name: "Contacto", phone: "55 1234 5678", phoneKey: "5512345678", source: "WhatsApp", createdAt: ago(1000) },
    });
    return { org, user, lead };
  }

  it("merges every kind of event, newest first", async () => {
    const { org, user, lead } = await setup();
    const stage = await prisma.pipelineStage.findFirstOrThrow({ where: { organizationId: org.id, isWon: false, isLost: false } });
    const opp = await prisma.opportunity.create({ data: { organizationId: org.id, leadId: lead.id, pipelineStageId: stage.id, title: "Implante" } });

    await prisma.note.create({ data: { organizationId: org.id, leadId: lead.id, authorId: user.id, content: "Llamar el jueves", createdAt: ago(90) } });
    const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp", contactPhone: "+52 1 55 1234 5678", phoneKey: "5512345678", leadId: lead.id, escalatedAt: ago(70) } });
    await prisma.message.createMany({
      data: [
        { conversationId: conv.id, role: "USER", content: "Hola", createdAt: ago(100) },
        { conversationId: conv.id, role: "ASSISTANT", content: "¡Hola!", createdAt: ago(99) },
        { conversationId: conv.id, role: "AGENT", content: "Te llamo", createdAt: ago(60) },
      ],
    });
    await prisma.appointment.create({ data: { organizationId: org.id, leadId: lead.id, title: "Valoración", startTime: ago(50), endTime: ago(20) } });
    const rule = await prisma.followUpRule.create({ data: { organizationId: org.id, name: "Seguimiento 2 días", triggerStatus: "CONTACTED", delayMinutes: 60, template: "Hola" } });
    await prisma.followUpLog.create({ data: { leadId: lead.id, ruleId: rule.id, sentAt: ago(40) } });
    const audit = (action: string, resource: string, resourceId: string, metadata: object, min: number) =>
      prisma.auditLog.create({ data: { organizationId: org.id, userId: user.id, action, resource, resourceId, metadata, createdAt: ago(min) } });
    await audit("lead.status_change", "Lead", lead.id, { from: "NEW", to: "CONTACTED" }, 80);
    await audit("opportunity.create", "Opportunity", opp.id, {}, 30);
    await audit("opportunity.stage_change", "Opportunity", opp.id, { toStageName: "Propuesta" }, 20);
    await audit("opportunity.lost", "Opportunity", opp.id, { lossReason: "Muy caro" }, 10);

    const { events, hasMore } = await getLeadTimeline(lead);

    expect(hasMore).toBe(false);
    expect(events.map((e) => e.type)).toEqual([
      "opportunity_lost", "stage_change", "opportunity_created", "follow_up", "appointment", "message", "escalated", "status_change", "note", "message", "message", "created",
    ]);
    // Orden estricto de más reciente a más antiguo
    const times = events.map((e) => e.date.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const status = events.find((e) => e.type === "status_change");
    expect(status).toMatchObject({ from: "NEW", to: "CONTACTED", actorName: expect.any(String) });
    expect(events.find((e) => e.type === "follow_up")).toMatchObject({ ruleName: "Seguimiento 2 días" });
    expect(events.find((e) => e.type === "opportunity_lost")).toMatchObject({ opportunityTitle: "Implante", reason: "Muy caro" });
    expect(events.filter((e) => e.type === "message").map((e) => (e as { role: string }).role)).toEqual(["AGENT", "ASSISTANT", "USER"]);
  });

  it("includes conversations not yet linked but with the same phone, in any format", async () => {
    const { org, lead } = await setup();
    const conv = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp", contactPhone: "(55) 1234-5678", phoneKey: "5512345678" } });
    await prisma.message.create({ data: { conversationId: conv.id, role: "USER", content: "Sin enlazar" } });
    const { events } = await getLeadTimeline(lead);
    expect(events.some((e) => e.type === "message")).toBe(true);
  });

  it("pages: shows only `limit` events and says there are more", async () => {
    const { org, lead } = await setup();
    await prisma.note.createMany({ data: Array.from({ length: 12 }, (_, i) => ({ organizationId: org.id, leadId: lead.id, content: `Nota ${i}`, createdAt: ago(i + 1) })) });
    const first = await getLeadTimeline(lead, 5);
    expect(first.events).toHaveLength(5);
    expect(first.hasMore).toBe(true);
    const all = await getLeadTimeline(lead, 50);
    expect(all.events).toHaveLength(13); // 12 notas + llegada
    expect(all.hasMore).toBe(false);
  });

  it("never shows another organization's activity", async () => {
    const { lead } = await setup();
    const other = await createTestOrg("Timeline Other");
    orgs.push(other.id);
    const otherConv = await prisma.conversation.create({ data: { organizationId: other.id, channel: "whatsapp", contactPhone: "55 1234 5678", phoneKey: "5512345678" } });
    await prisma.message.create({ data: { conversationId: otherConv.id, role: "USER", content: "De otra organización" } });
    const { events } = await getLeadTimeline(lead);
    expect(events.some((e) => e.type === "message")).toBe(false);
  });
});
