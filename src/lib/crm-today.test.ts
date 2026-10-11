// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestPipelineStages, cleanupOrg } from "@/test/helpers";
import { dayRangeIn, getTodayView } from "./crm-today";

describe("dayRangeIn", () => {
  it("returns the business's calendar day, not the server's", () => {
    // 2026-10-05 15:00Z = 09:00 en CDMX (UTC-6, sin horario de verano)
    const { start, end } = dayRangeIn("America/Mexico_City", new Date("2026-10-05T15:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-05T06:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-06T06:00:00.000Z");
  });
  it("uses the next local day when UTC is already tomorrow", () => {
    // 2026-10-06 03:00Z = 21:00 del 5 de octubre en CDMX
    const { start } = dayRangeIn("America/Mexico_City", new Date("2026-10-06T03:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-05T06:00:00.000Z");
  });
  it("falls back instead of failing on a bad timezone", () => {
    expect(() => dayRangeIn("No/Existe")).not.toThrow();
  });
});

describe("getTodayView", () => {
  const orgs: string[] = [];
  afterEach(async () => {
    for (const id of orgs.splice(0)) await cleanupOrg(id);
  });
  const hours = (n: number) => new Date(Date.now() - n * 3600_000);

  it("lists what needs a person today and nothing else", async () => {
    const org = await createTestOrg("Today Org");
    orgs.push(org.id);
    const stages = await createTestPipelineStages(org.id);
    const open = await prisma.pipelineStage.findFirstOrThrow({ where: { organizationId: org.id, isWon: false, isLost: false } });
    const won = await prisma.pipelineStage.findFirstOrThrow({ where: { organizationId: org.id, isWon: true } });
    expect(stages).toBeDefined();

    const oldNew = await prisma.lead.create({ data: { organizationId: org.id, name: "Nuevo viejo", status: "NEW", createdAt: hours(5) } });
    await prisma.lead.create({ data: { organizationId: org.id, name: "Nuevo recién llegado", status: "NEW" } }); // dentro del margen
    await prisma.lead.create({ data: { organizationId: org.id, name: "No molestar", status: "NEW", doNotContact: true, createdAt: hours(5) } });
    await prisma.lead.create({ data: { organizationId: org.id, name: "Ya contactado", status: "CONTACTED", createdAt: hours(5) } });

    // Conversaciones
    const mk = async (data: { status?: "OPEN" | "ESCALATED"; aiHandled: boolean; role: "USER" | "ASSISTANT"; name: string }) => {
      const c = await prisma.conversation.create({ data: { organizationId: org.id, channel: "whatsapp", contactName: data.name, status: data.status ?? "OPEN", aiHandled: data.aiHandled } });
      await prisma.message.create({ data: { conversationId: c.id, role: data.role, content: "Hola, ¿me ayudan?" } });
      return c;
    };
    await mk({ status: "ESCALATED", aiHandled: false, role: "USER", name: "Espera humano" });
    await mk({ aiHandled: true, role: "USER", name: "La IA lo atiende" });
    await mk({ status: "ESCALATED", aiHandled: false, role: "ASSISTANT", name: "Ya contestado" });

    // Oportunidades
    const lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Con oportunidades" } });
    const opp = (title: string, extra: Record<string, unknown>, stageId = open.id) =>
      prisma.opportunity.create({ data: { organizationId: org.id, leadId: lead.id, pipelineStageId: stageId, title, ...extra } });
    await opp("Vencida", { nextActivityAt: hours(24) });
    const old = await opp("Sin movimiento", {});
    await prisma.$executeRaw`UPDATE "Opportunity" SET "updatedAt" = now() - interval '10 days' WHERE id = ${old.id}`;
    await opp("Al corriente", { nextActivityAt: new Date(Date.now() + 48 * 3600_000) });
    await opp("Ganada vieja", { nextActivityAt: hours(48) }, won.id);

    // Citas
    const t = new Date();
    await prisma.appointment.create({ data: { organizationId: org.id, leadId: oldNew.id, title: "Cita de hoy", startTime: t, endTime: new Date(t.getTime() + 1800_000), status: "CONFIRMED" } });
    await prisma.appointment.create({ data: { organizationId: org.id, title: "Cancelada", startTime: t, endTime: new Date(t.getTime() + 1800_000), status: "CANCELLED" } });
    await prisma.appointment.create({ data: { organizationId: org.id, title: "Pasado mañana", startTime: new Date(t.getTime() + 48 * 3600_000), endTime: new Date(t.getTime() + 49 * 3600_000) } });

    const view = await getTodayView(org.id, "America/Mexico_City");

    expect(view.waiting.items.map((w) => w.name)).toEqual(["Espera humano"]);
    expect(view.newLeads.items.map((l) => l.name)).toEqual(["Nuevo viejo"]);
    expect(view.staleOpportunities.items.map((o) => o.title).sort()).toEqual(["Sin movimiento", "Vencida"]);
    expect(view.staleOpportunities.items.find((o) => o.title === "Vencida")?.overdue).toBe(true);
    expect(view.appointments.items.map((a) => a.title)).toEqual(["Cita de hoy"]);
    expect(view.appointments.items[0].leadName).toBe("Nuevo viejo");
    expect(view.followUps.total).toBe(0);
  });

  it("includes follow-ups that are due and never leaks another organization's data", async () => {
    const orgA = await createTestOrg("Today A");
    const orgB = await createTestOrg("Today B");
    orgs.push(orgA.id, orgB.id);
    await prisma.followUpRule.create({ data: { organizationId: orgA.id, name: "Regla", triggerStatus: "CONTACTED", delayMinutes: 60, template: "Hola" } });
    const lead = await prisma.lead.create({ data: { organizationId: orgA.id, name: "Para seguimiento", status: "CONTACTED" } });
    await prisma.$executeRaw`UPDATE "Lead" SET "updatedAt" = now() - interval '3 hours' WHERE id = ${lead.id}`;

    const a = await getTodayView(orgA.id, "America/Mexico_City");
    const b = await getTodayView(orgB.id, "America/Mexico_City");
    expect(a.followUps.items.map((f) => f.name)).toEqual(["Para seguimiento"]);
    expect(b.followUps.total + b.newLeads.total + b.waiting.total + b.appointments.total + b.staleOpportunities.total).toBe(0);
  });
});
