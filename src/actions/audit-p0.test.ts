// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, createTestPipelineStages, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createOpportunity, updateOpportunity } = await import("./opportunities");
const { createAppointment, updateAppointmentStatus } = await import("./appointments");
const { createLead, deleteLead, mergeLeads } = await import("./leads");

// Auditoría maestra, lote P0: AUD-001 (propietario ajeno), AUD-002 (lead ajeno), AUD-003 (permisos de leads), AUD-021 (reactivar cita).
describe("auditoría P0: aislamiento entre organizaciones y permisos", () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let ownerA: { id: string };
  let agentA: { id: string };
  let managerA: { id: string };
  let foreignUser: { id: string };
  let leadA: { id: string };
  let foreignLead: { id: string };

  beforeAll(async () => {
    orgA = await createTestOrg("Audit P0 A");
    orgB = await createTestOrg("Audit P0 B");
    ownerA = await createTestUser(orgA.id, "OWNER", "audit-owner-a");
    agentA = await createTestUser(orgA.id, "AGENT", "audit-agent-a");
    managerA = await createTestUser(orgA.id, "MANAGER", "audit-manager-a");
    foreignUser = await createTestUser(orgB.id, "OWNER", "audit-owner-b");
    await createTestPipelineStages(orgA.id);
    leadA = await prisma.lead.create({ data: { organizationId: orgA.id, name: "Lead A" } });
    foreignLead = await prisma.lead.create({ data: { organizationId: orgB.id, name: "Lead Ajeno", phone: "+5215500000000" } });
  });
  afterAll(async () => {
    await cleanupOrg(orgA.id);
    await cleanupOrg(orgB.id);
  });
  const as = (id: string, role: "OWNER" | "AGENT" | "MANAGER") => authMock.mockResolvedValue(fakeSession({ id, role, organizationId: orgA.id }));

  it("AUD-001: una oportunidad no admite como propietario a un usuario de otra organización", async () => {
    as(ownerA.id, "OWNER");
    await expect(createOpportunity({ leadId: leadA.id, title: "X", ownerId: foreignUser.id })).rejects.toThrow(/Usuario no encontrado/);
    const ok = await createOpportunity({ leadId: leadA.id, title: "Propia", ownerId: agentA.id });
    await expect(updateOpportunity({ opportunityId: ok.opportunityId, ownerId: foreignUser.id })).rejects.toThrow(/Usuario no encontrado/);
    await updateOpportunity({ opportunityId: ok.opportunityId, ownerId: managerA.id });
    expect((await prisma.opportunity.findUniqueOrThrow({ where: { id: ok.opportunityId } })).ownerId).toBe(managerA.id);
    await expect(updateOpportunity({ opportunityId: ok.opportunityId, ownerId: null })).resolves.toMatchObject({ success: true });
  });

  it("AUD-002: una cita no admite un lead de otra organización", async () => {
    as(ownerA.id, "OWNER");
    const start = new Date(Date.now() + 200 * 3600_000);
    await expect(createAppointment({ title: "Cita ajena", startTime: start.toISOString(), endTime: new Date(start.getTime() + 1800_000).toISOString(), leadId: foreignLead.id })).rejects.toThrow(/Lead no encontrado/);
    expect(await prisma.appointment.count({ where: { organizationId: orgA.id, leadId: foreignLead.id } })).toBe(0);
    await expect(createAppointment({ title: "Cita propia", startTime: start.toISOString(), endTime: new Date(start.getTime() + 1800_000).toISOString(), leadId: leadA.id })).resolves.toMatchObject({ success: true });
  });

  it("AUD-003: crear, eliminar y fusionar leads respetan el permiso del rol", async () => {
    const viewer = await createTestUser(orgA.id, "VIEWER", "audit-viewer-a");
    as(viewer.id, "AGENT");
    authMock.mockResolvedValue(fakeSession({ id: viewer.id, role: "VIEWER", organizationId: orgA.id }));
    const fd = new FormData();
    fd.set("name", "Intruso");
    await expect(createLead(fd)).rejects.toThrow(/autorizado/i);
    await expect(deleteLead(leadA.id)).rejects.toThrow(/autorizado/i);
    await expect(mergeLeads(leadA.id, leadA.id)).rejects.toThrow(/autorizado/i);

    as(agentA.id, "AGENT");
    await expect(deleteLead(leadA.id)).rejects.toThrow(/autorizado/i);
    as(managerA.id, "MANAGER");
    await expect(mergeLeads(leadA.id, leadA.id)).rejects.toThrow(/autorizado/i);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: leadA.id } })).deletedAt).toBeNull();

    as(ownerA.id, "OWNER");
    const extra = await prisma.lead.create({ data: { organizationId: orgA.id, name: "Duplicado" } });
    await expect(mergeLeads(leadA.id, extra.id)).resolves.toMatchObject({ success: true });
  });

  it("AUD-021: reactivar una cita cancelada vuelve a comprobar el solapamiento", async () => {
    as(ownerA.id, "OWNER");
    const start = new Date(Date.now() + 400 * 3600_000);
    const end = new Date(start.getTime() + 3600_000);
    const first = await prisma.appointment.create({ data: { organizationId: orgA.id, title: "Original", startTime: start, endTime: end, status: "CANCELLED" } });
    await createAppointment({ title: "Nueva en el mismo horario", startTime: start.toISOString(), endTime: end.toISOString() });
    await expect(updateAppointmentStatus(first.id, "SCHEDULED")).rejects.toThrow(/ocupado/);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("CANCELLED");
    // Un horario libre sí se puede reactivar, y el estado cambia en la misma operación.
    const free = await prisma.appointment.create({ data: { organizationId: orgA.id, title: "Libre", startTime: new Date(start.getTime() + 10 * 3600_000), endTime: new Date(start.getTime() + 11 * 3600_000), status: "CANCELLED" } });
    await updateAppointmentStatus(free.id, "CONFIRMED");
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: free.id } })).status).toBe("CONFIRMED");
  });
});
