"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assertModuleEnabled } from "@/lib/modules";
import { logAudit } from "@/lib/audit";
import { UserError } from "@/lib/user-error";
import { assertOrgLead, assertOrgUser } from "@/lib/org-guards";
import { canEditTask, remindAtFor, TASK_PRIORITIES, TASK_TYPES } from "@/lib/tasks";

async function requireTaskUser() {
  const session = await auth();
  if (!session?.user.organizationId) throw new UserError("No autorizado");
  await assertModuleEnabled(session.user.organizationId, "CRM");
  if (!can(session.user.role as UserRole, "tasks:manage")) throw new UserError("No autorizado");
  return { orgId: session.user.organizationId, user: { id: session.user.id, role: session.user.role as UserRole } };
}

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), "Fecha inválida")
  .nullable()
  .optional();

const taskSchema = z.object({
  title: z.string().trim().min(1, "Escribe qué hay que hacer").max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  type: z.enum(TASK_TYPES).default("OTHER"),
  priority: z.enum(TASK_PRIORITIES).default("NORMAL"),
  dueAt: isoDate,
  /** Minutos antes del vencimiento; null = sin recordatorio. */
  reminderMinutes: z.number().int().min(0).max(7 * 24 * 60).nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  leadId: z.string().nullable().optional(),
  opportunityId: z.string().nullable().optional(),
});

export type TaskInput = z.input<typeof taskSchema>;

async function resolveLinks(orgId: string, data: { leadId?: string | null; opportunityId?: string | null; assigneeId?: string | null }) {
  let leadId = data.leadId || null;
  const opportunityId = data.opportunityId || null;
  if (leadId) await assertOrgLead(orgId, leadId);
  if (opportunityId) {
    const opp = await prisma.opportunity.findFirst({ where: { id: opportunityId, organizationId: orgId }, select: { leadId: true } });
    if (!opp) throw new UserError("Oportunidad no encontrada");
    if (leadId && opp.leadId !== leadId) throw new UserError("La oportunidad no es de ese contacto");
    leadId = opp.leadId;
  }
  if (data.assigneeId) await assertOrgUser(orgId, data.assigneeId);
  return { leadId, opportunityId };
}

function revalidateTaskViews(leadId: string | null) {
  revalidatePath("/portal/tasks");
  revalidatePath("/portal/today");
  if (leadId) revalidatePath(`/portal/leads/${leadId}`);
}

export async function createTask(input: TaskInput) {
  const { orgId, user } = await requireTaskUser();
  const data = taskSchema.parse(input);
  // El Agente crea tareas para sí mismo; asignar a otra persona es de Gerente para arriba.
  const assigneeId = data.assigneeId === undefined ? user.id : data.assigneeId;
  if (user.role === "AGENT" && assigneeId !== user.id) throw new UserError("Solo puedes asignarte tareas a ti");
  const links = await resolveLinks(orgId, { ...data, assigneeId });
  const dueAt = data.dueAt ? new Date(data.dueAt) : null;

  const task = await prisma.task.create({
    data: {
      organizationId: orgId,
      title: data.title,
      description: data.description || null,
      type: data.type,
      priority: data.priority,
      dueAt,
      remindAt: remindAtFor(dueAt, data.reminderMinutes ?? null),
      assigneeId,
      createdById: user.id,
      ...links,
    },
  });
  await logAudit({ organizationId: orgId, userId: user.id, action: "task.create", resource: "Task", resourceId: task.id, metadata: { title: task.title, assigneeId, leadId: links.leadId } });
  revalidateTaskViews(links.leadId);
  return { success: true, taskId: task.id };
}

async function loadEditable(orgId: string, user: { id: string; role: UserRole }, taskId: string) {
  const task = await prisma.task.findFirst({ where: { id: taskId, organizationId: orgId } });
  if (!task) throw new UserError("Tarea no encontrada");
  if (!canEditTask(user, task)) throw new UserError("Solo puedes cambiar tus tareas");
  return task;
}

export async function updateTask(taskId: string, input: TaskInput) {
  const { orgId, user } = await requireTaskUser();
  const task = await loadEditable(orgId, user, taskId);
  const data = taskSchema.parse(input);
  const assigneeId = data.assigneeId === undefined ? task.assigneeId : data.assigneeId;
  if (user.role === "AGENT" && assigneeId !== task.assigneeId && assigneeId !== user.id) throw new UserError("Solo puedes asignarte tareas a ti");
  const links = await resolveLinks(orgId, { ...data, assigneeId });
  const dueAt = data.dueAt ? new Date(data.dueAt) : null;
  const remindAt = remindAtFor(dueAt, data.reminderMinutes ?? null);
  // Si cambió cuándo avisar (o a quién), el recordatorio se vuelve a mandar.
  const resetReminder = remindAt?.getTime() !== task.remindAt?.getTime() || assigneeId !== task.assigneeId;

  await prisma.task.update({
    where: { id: task.id },
    data: {
      title: data.title,
      description: data.description || null,
      type: data.type,
      priority: data.priority,
      dueAt,
      remindAt,
      ...(resetReminder ? { reminderSentAt: null } : {}),
      assigneeId,
      ...links,
    },
  });
  await logAudit({ organizationId: orgId, userId: user.id, action: "task.update", resource: "Task", resourceId: task.id, metadata: { title: data.title, assigneeId } });
  revalidateTaskViews(links.leadId ?? task.leadId);
  if (task.leadId && task.leadId !== links.leadId) revalidatePath(`/portal/leads/${task.leadId}`);
  return { success: true };
}

/** Marca como hecha (o la reabre). */
export async function setTaskDone(taskId: string, done: boolean) {
  const { orgId, user } = await requireTaskUser();
  const task = await loadEditable(orgId, user, taskId);
  await prisma.task.update({
    where: { id: task.id },
    data: done ? { status: "DONE", completedAt: new Date(), completedById: user.id } : { status: "OPEN", completedAt: null, completedById: null },
  });
  await logAudit({ organizationId: orgId, userId: user.id, action: done ? "task.complete" : "task.reopen", resource: "Task", resourceId: task.id, metadata: { title: task.title } });
  revalidateTaskViews(task.leadId);
  return { success: true };
}

export async function deleteTask(taskId: string) {
  const { orgId, user } = await requireTaskUser();
  const task = await loadEditable(orgId, user, taskId);
  await prisma.task.delete({ where: { id: task.id } });
  await logAudit({ organizationId: orgId, userId: user.id, action: "task.delete", resource: "Task", resourceId: task.id, metadata: { title: task.title } });
  revalidateTaskViews(task.leadId);
  return { success: true };
}
