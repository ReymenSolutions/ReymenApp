// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, createTestPipelineStages, fakeSession, cleanupOrg } from "@/test/helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const sendEmail = vi.fn().mockResolvedValue({ sent: true });
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: () => authMock() }));

const { createTask, updateTask, setTaskDone, deleteTask } = await import("./tasks");
const { listTasks, getLeadTasks, getMyDueTasks, getTaskBellItems, sendDueTaskReminders, bucketOf, remindAtFor } = await import("@/lib/tasks");

const TZ = "America/Mexico_City";

describe("Tareas y pendientes del CRM", () => {
  let org: { id: string };
  let other: { id: string };
  let owner: { id: string };
  let agent: { id: string };
  let agent2: { id: string };
  let viewer: { id: string };
  let lead: { id: string };
  let otherLead: { id: string };
  let opp: { id: string };
  const as = (u: { id: string }, role: "OWNER" | "AGENT" | "VIEWER", orgId = org.id) => authMock.mockResolvedValue(fakeSession({ id: u.id, role, organizationId: orgId }));

  beforeAll(async () => {
    org = await createTestOrg("Tasks Org");
    other = await createTestOrg("Tasks Other Org");
    owner = await createTestUser(org.id, "OWNER", "tasks-owner");
    agent = await createTestUser(org.id, "AGENT", "tasks-agent");
    agent2 = await createTestUser(org.id, "AGENT", "tasks-agent2");
    viewer = await createTestUser(org.id, "VIEWER", "tasks-viewer");
    const stages = await createTestPipelineStages(org.id);
    lead = await prisma.lead.create({ data: { organizationId: org.id, name: "Ana Cliente", phone: "+5215511112222" } });
    otherLead = await prisma.lead.create({ data: { organizationId: other.id, name: "Ajeno" } });
    opp = await prisma.opportunity.create({ data: { organizationId: org.id, leadId: lead.id, pipelineStageId: stages[0].id, title: "Cotización" } });
  });
  afterAll(async () => {
    await cleanupOrg(org.id);
    await cleanupOrg(other.id);
  });

  it("agrupa por día del negocio y calcula el recordatorio", () => {
    const now = new Date("2026-11-05T18:00:00Z"); // 12:00 en CDMX
    const range = { start: new Date("2026-11-05T06:00:00Z"), end: new Date("2026-11-06T06:00:00Z") };
    expect(bucketOf({ status: "OPEN", dueAt: new Date("2026-11-05T17:00:00Z") }, range, now)).toBe("overdue");
    expect(bucketOf({ status: "OPEN", dueAt: new Date("2026-11-06T05:00:00Z") }, range, now)).toBe("today");
    expect(bucketOf({ status: "OPEN", dueAt: new Date("2026-11-06T07:00:00Z") }, range, now)).toBe("upcoming");
    expect(bucketOf({ status: "OPEN", dueAt: null }, range, now)).toBe("noDate");
    expect(bucketOf({ status: "DONE", dueAt: null }, range, now)).toBe("done");
    expect(remindAtFor(new Date("2026-11-05T18:00:00Z"), 15)?.toISOString()).toBe("2026-11-05T17:45:00.000Z");
    expect(remindAtFor(null, 15)).toBeNull();
    expect(remindAtFor(new Date(), null)).toBeNull();
  });

  it("el dueño crea una tarea ligada a una oportunidad (el contacto se toma de ella) y la asigna", async () => {
    as(owner, "OWNER");
    const due = new Date(Date.now() + 2 * 3600_000);
    const out = await createTask({ title: "Llamar para cerrar", type: "CALL", priority: "HIGH", dueAt: due.toISOString(), reminderMinutes: 60, assigneeId: agent.id, opportunityId: opp.id });
    const task = await prisma.task.findUniqueOrThrow({ where: { id: out.taskId } });
    expect(task).toMatchObject({ leadId: lead.id, opportunityId: opp.id, assigneeId: agent.id, createdById: owner.id, status: "OPEN", priority: "HIGH" });
    expect(task.remindAt?.getTime()).toBe(due.getTime() - 3600_000);
    expect((await getLeadTasks(org.id, lead.id)).map((t) => t.id)).toContain(task.id);
  });

  it("no acepta contactos, oportunidades ni responsables de otra organización", async () => {
    as(owner, "OWNER");
    await expect(createTask({ title: "x", leadId: otherLead.id })).rejects.toThrow(/Lead no encontrado/);
    const foreignUser = await createTestUser(other.id, "OWNER", "tasks-foreign");
    await expect(createTask({ title: "x", assigneeId: foreignUser.id })).rejects.toThrow(/Usuario no encontrado/);
    await expect(createTask({ title: "x", opportunityId: "nope" })).rejects.toThrow(/Oportunidad no encontrada/);
    await expect(createTask({ title: "   " })).rejects.toThrow();
  });

  it("el agente solo se asigna a sí mismo y solo cambia sus tareas; el visor no crea", async () => {
    as(agent, "AGENT");
    await expect(createTask({ title: "Para otro", assigneeId: agent2.id })).rejects.toThrow(/a ti/);
    const mine = await createTask({ title: "Mía", leadId: lead.id });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: mine.taskId } })).assigneeId).toBe(agent.id);

    as(agent2, "AGENT");
    await expect(setTaskDone(mine.taskId, true)).rejects.toThrow(/tus tareas/);
    await expect(deleteTask(mine.taskId)).rejects.toThrow(/tus tareas/);

    as(viewer, "VIEWER");
    await expect(createTask({ title: "Visor" })).rejects.toThrow(/autorizado/);
  });

  it("marcar como hecha y reabrir; editar reprograma el recordatorio", async () => {
    as(owner, "OWNER");
    const due = new Date(Date.now() + 3 * 3600_000);
    const { taskId } = await createTask({ title: "Enviar propuesta", type: "EMAIL", dueAt: due.toISOString(), reminderMinutes: 15, assigneeId: owner.id });
    await prisma.task.update({ where: { id: taskId }, data: { reminderSentAt: new Date() } });

    await updateTask(taskId, { title: "Enviar propuesta v2", type: "EMAIL", dueAt: new Date(due.getTime() + 3600_000).toISOString(), reminderMinutes: 15, assigneeId: owner.id });
    const edited = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(edited.title).toBe("Enviar propuesta v2");
    expect(edited.reminderSentAt).toBeNull();

    await setTaskDone(taskId, true);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({ status: "DONE", completedById: owner.id });
    await setTaskDone(taskId, false);
    expect(await prisma.task.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({ status: "OPEN", completedAt: null });
    await deleteTask(taskId);
    expect(await prisma.task.findUnique({ where: { id: taskId } })).toBeNull();
  });

  it("lista: mis tareas vs todo el equipo; Hoy y la campana muestran lo vencido del usuario", async () => {
    const now = new Date();
    await prisma.task.create({ data: { organizationId: org.id, title: "Vencida del agente", assigneeId: agent.id, dueAt: new Date(now.getTime() - 3600_000), remindAt: new Date(now.getTime() - 7200_000) } });
    const mine = await listTasks({ organizationId: org.id, userId: agent.id, scope: "mine", timeZone: TZ, now });
    expect(mine.overdue.map((t) => t.title)).toContain("Vencida del agente");
    expect([...mine.overdue, ...mine.today, ...mine.upcoming, ...mine.noDate].every((t) => t.assigneeId === agent.id)).toBe(true);
    const all = await listTasks({ organizationId: org.id, userId: owner.id, scope: "all", timeZone: TZ, now });
    expect(all.counts.overdue + all.counts.today + all.counts.upcoming + all.counts.noDate).toBeGreaterThan(mine.counts.overdue + mine.counts.today + mine.counts.upcoming + mine.counts.noDate - 1);
    const filtered = await listTasks({ organizationId: org.id, userId: owner.id, scope: "all", assigneeId: agent2.id, timeZone: TZ, now });
    expect(filtered.overdue.length + filtered.today.length + filtered.upcoming.length + filtered.noDate.length).toBe(0);

    const today = await getMyDueTasks(org.id, agent.id, TZ, now);
    expect(today.items.map((t) => t.title)).toContain("Vencida del agente");
    expect((await getTaskBellItems(org.id, agent.id, now)).map((t) => t.title)).toContain("Vencida del agente");
    expect((await getTaskBellItems(org.id, owner.id, now)).map((t) => t.title)).not.toContain("Vencida del agente");
  });

  it("el reloj manda cada recordatorio una sola vez, al responsable, y no a tareas cerradas", async () => {
    sendEmail.mockClear();
    const now = new Date();
    const due = await prisma.task.create({ data: { organizationId: org.id, title: "Recordarme", assigneeId: owner.id, leadId: lead.id, dueAt: new Date(now.getTime() + 15 * 60_000), remindAt: new Date(now.getTime() - 60_000) } });
    await prisma.task.create({ data: { organizationId: org.id, title: "Cerrada", status: "DONE", assigneeId: owner.id, remindAt: new Date(now.getTime() - 60_000) } });
    await prisma.task.create({ data: { organizationId: org.id, title: "Futura", assigneeId: owner.id, remindAt: new Date(now.getTime() + 3600_000) } });

    const [a, b] = await Promise.all([sendDueTaskReminders(now, { organizationId: org.id }), sendDueTaskReminders(now, { organizationId: org.id })]);
    const ownerEmail = (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).email;
    const toOwner = sendEmail.mock.calls.filter(([m]) => (m as { to: string; subject: string }).to === ownerEmail).map(([m]) => (m as { subject: string }).subject);
    expect(toOwner.filter((s) => s.includes("Recordarme"))).toHaveLength(1);
    expect(toOwner.some((s) => s.includes("Cerrada") || s.includes("Futura"))).toBe(false);
    expect(a.sent + b.sent).toBeGreaterThanOrEqual(1);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: due.id } })).reminderSentAt).not.toBeNull();

    sendEmail.mockClear();
    await sendDueTaskReminders(now, { organizationId: org.id });
    expect(sendEmail.mock.calls.some(([m]) => (m as { subject: string }).subject.includes("Recordarme"))).toBe(false);
  });

  it("borrar el contacto borra sus tareas; borrar la oportunidad solo la desliga", async () => {
    const l2 = await prisma.lead.create({ data: { organizationId: org.id, name: "Temporal" } });
    const t1 = await prisma.task.create({ data: { organizationId: org.id, title: "Del temporal", leadId: l2.id } });
    const t2 = await prisma.task.create({ data: { organizationId: org.id, title: "De la oportunidad", leadId: lead.id, opportunityId: opp.id } });
    await prisma.lead.delete({ where: { id: l2.id } });
    expect(await prisma.task.findUnique({ where: { id: t1.id } })).toBeNull();
    await prisma.opportunity.delete({ where: { id: opp.id } });
    expect((await prisma.task.findUniqueOrThrow({ where: { id: t2.id } })).opportunityId).toBeNull();
  });
});
