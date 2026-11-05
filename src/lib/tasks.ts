import type { Prisma, TaskPriority, TaskStatus, TaskType, UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { dayRangeIn } from "./crm-today";
import { sendEmail } from "./email";
import { renderBrandedEmail } from "./email-template";
import { appUrl } from "./app-url";
import { formatDateTimeInTz } from "./utils";

// Tareas y pendientes del CRM. Este archivo es la única fuente de cómo se agrupan (vencidas, hoy, próximas, sin
// fecha), quién puede tocar cuál y cuándo se manda el recordatorio. Las acciones y las pantallas solo lo usan.

export const TASK_TYPES = ["CALL", "WHATSAPP", "EMAIL", "MEETING", "VISIT", "OTHER"] as const satisfies readonly TaskType[];
export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const satisfies readonly TaskPriority[];
/** Minutos antes del vencimiento en que se avisa. 0 = a la hora; null = sin recordatorio. */
export const REMINDER_OFFSETS = [0, 15, 60, 24 * 60] as const;

export const TASK_SELECT = {
  id: true,
  title: true,
  description: true,
  type: true,
  status: true,
  priority: true,
  dueAt: true,
  remindAt: true,
  completedAt: true,
  createdAt: true,
  assigneeId: true,
  createdById: true,
  leadId: true,
  opportunityId: true,
  assignee: { select: { id: true, name: true, email: true } },
  lead: { select: { id: true, name: true, phone: true } },
  opportunity: { select: { id: true, title: true } },
} satisfies Prisma.TaskSelect;

export type TaskRow = Prisma.TaskGetPayload<{ select: typeof TASK_SELECT }>;

/** Una tarea lista para mandarse a un componente de cliente (fechas en ISO). */
export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  reminderMinutes: number | null;
  assigneeId: string | null;
  createdById: string | null;
  assigneeName: string | null;
  lead: { id: string; name: string; phone: string | null } | null;
  opportunity: { id: string; title: string } | null;
}

export function toTaskItem(t: TaskRow): TaskItem {
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    type: t.type,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt?.toISOString() ?? null,
    reminderMinutes: reminderOffsetOf(t),
    assigneeId: t.assigneeId,
    createdById: t.createdById,
    assigneeName: t.assignee ? (t.assignee.name ?? t.assignee.email) : null,
    lead: t.lead,
    opportunity: t.opportunity,
  };
}

export type TaskBucket = "overdue" | "today" | "upcoming" | "noDate" | "done";

/** En qué grupo cae una tarea según el día del negocio. */
export function bucketOf(task: { status: TaskStatus; dueAt: Date | null }, range: { start: Date; end: Date }, now: Date): TaskBucket {
  if (task.status !== "OPEN") return "done";
  if (!task.dueAt) return "noDate";
  if (task.dueAt < now) return "overdue";
  if (task.dueAt < range.end) return "today";
  return "upcoming";
}

/** El Agente solo trabaja las tareas suyas (asignadas a él o creadas por él); los demás roles con permiso, todas. */
export function canEditTask(user: { id: string; role: UserRole }, task: { assigneeId: string | null; createdById: string | null }): boolean {
  if (user.role !== "AGENT") return true;
  return task.assigneeId === user.id || task.createdById === user.id;
}

/** El instante del recordatorio: tantos minutos antes del vencimiento. Sin vencimiento no hay recordatorio. */
export function remindAtFor(dueAt: Date | null, offsetMinutes: number | null): Date | null {
  if (!dueAt || offsetMinutes === null) return null;
  return new Date(dueAt.getTime() - offsetMinutes * 60_000);
}

/** Minutos de anticipación guardados, deducidos de vencimiento y recordatorio (para volver a llenar el formulario). */
export function reminderOffsetOf(task: { dueAt: Date | null; remindAt: Date | null }): number | null {
  if (!task.dueAt || !task.remindAt) return null;
  return Math.round((task.dueAt.getTime() - task.remindAt.getTime()) / 60_000);
}

export type TaskScope = "mine" | "all";

export interface TaskListView {
  overdue: TaskRow[];
  today: TaskRow[];
  upcoming: TaskRow[];
  noDate: TaskRow[];
  done: TaskRow[];
  counts: { overdue: number; today: number; upcoming: number; noDate: number };
}

/** Las tareas de la organización (o solo las del usuario) agrupadas para la pantalla de Tareas. */
export async function listTasks(opts: { organizationId: string; userId: string; scope: TaskScope; assigneeId?: string | null; timeZone: string; now?: Date }): Promise<TaskListView> {
  const now = opts.now ?? new Date();
  const range = dayRangeIn(opts.timeZone, now);
  const who: Prisma.TaskWhereInput =
    opts.scope === "mine" ? { assigneeId: opts.userId } : opts.assigneeId ? { assigneeId: opts.assigneeId } : {};
  const [open, done] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId: opts.organizationId, status: "OPEN", ...who },
      select: TASK_SELECT,
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { createdAt: "asc" }],
      take: 500,
    }),
    prisma.task.findMany({
      where: { organizationId: opts.organizationId, status: { in: ["DONE", "CANCELLED"] }, ...who, updatedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
      select: TASK_SELECT,
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);
  const view: TaskListView = { overdue: [], today: [], upcoming: [], noDate: [], done, counts: { overdue: 0, today: 0, upcoming: 0, noDate: 0 } };
  for (const t of open) {
    const b = bucketOf(t, range, now);
    if (b === "done") continue;
    view[b].push(t);
    view.counts[b]++;
  }
  return view;
}

/** Las tareas de un contacto: abiertas primero (por vencimiento) y las cerradas recientes después. */
export async function getLeadTasks(organizationId: string, leadId: string): Promise<TaskRow[]> {
  const rows = await prisma.task.findMany({
    where: { organizationId, leadId },
    select: TASK_SELECT,
    orderBy: [{ status: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 50,
  });
  return rows;
}

/** Para «Hoy»: lo vencido y lo de hoy del usuario. */
export async function getMyDueTasks(organizationId: string, userId: string, timeZone: string, now = new Date()) {
  const { end } = dayRangeIn(timeZone, now);
  const where: Prisma.TaskWhereInput = { organizationId, assigneeId: userId, status: "OPEN", dueAt: { lt: end } };
  const [total, items] = await Promise.all([
    prisma.task.count({ where }),
    prisma.task.findMany({ where, select: TASK_SELECT, orderBy: [{ dueAt: "asc" }, { priority: "desc" }], take: 8 }),
  ]);
  return { total, items };
}

/** Para la campana: tareas del usuario vencidas o cuyo recordatorio ya llegó. */
export async function getTaskBellItems(organizationId: string, userId: string, now = new Date()) {
  return prisma.task.findMany({
    where: {
      organizationId,
      assigneeId: userId,
      status: "OPEN",
      OR: [{ dueAt: { lte: now } }, { remindAt: { lte: now } }],
    },
    select: { id: true, title: true, dueAt: true, remindAt: true, lead: { select: { id: true, name: true } } },
    orderBy: { dueAt: "asc" },
    take: 10,
  });
}

const TYPE_LABEL: Record<"es" | "en", Record<TaskType, string>> = {
  es: { CALL: "Llamada", WHATSAPP: "WhatsApp", EMAIL: "Correo", MEETING: "Reunión", VISIT: "Visita", OTHER: "Pendiente" },
  en: { CALL: "Call", WHATSAPP: "WhatsApp", EMAIL: "Email", MEETING: "Meeting", VISIT: "Visit", OTHER: "To-do" },
};

export type TaskReminderHook = (task: { id: string; organizationId: string; assigneeId: string; title: string; leadId: string | null; dueAt: Date | null }) => Promise<void>;

/**
 * Manda los recordatorios que ya tocan (lo llama el reloj cada 5 min). Cada tarea se «reclama» con un updateMany
 * condicionado, así que dos relojes simultáneos nunca avisan dos veces. Avisa por correo al responsable y, si se pasa
 * `onReminder`, también por otros canales (push). Un fallo al enviar no revierte el reclamo: se pierde un aviso,
 * nunca se repite en bucle.
 */
export async function sendDueTaskReminders(now = new Date(), opts: { organizationId?: string; onReminder?: TaskReminderHook } = {}): Promise<{ sent: number }> {
  const due = await prisma.task.findMany({
    where: {
      status: "OPEN",
      reminderSentAt: null,
      remindAt: { lte: now, gte: new Date(now.getTime() - 2 * 86_400_000) },
      assigneeId: { not: null },
      ...(opts.organizationId ? { organizationId: opts.organizationId } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      title: true,
      description: true,
      type: true,
      dueAt: true,
      leadId: true,
      assigneeId: true,
      assignee: { select: { email: true, name: true, isActive: true, language: true } },
      lead: { select: { name: true, phone: true } },
      organization: { select: { timezone: true, isActive: true } },
    },
    take: 200,
  });
  let sent = 0;
  for (const t of due) {
    const claimed = await prisma.task.updateMany({ where: { id: t.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (claimed.count === 0) continue;
    if (!t.assignee?.isActive || !t.organization.isActive || !t.assigneeId) continue;
    const lang = t.assignee.language === "en" ? "en" : "es";
    const when = t.dueAt ? formatDateTimeInTz(t.dueAt, t.organization.timezone, lang) : "";
    const link = appUrl(t.leadId ? `/portal/leads/${t.leadId}` : "/portal/tasks");
    const L = lang === "en"
      ? { subject: `Reminder: ${t.title}`, title: "Task reminder", intro: `Hi ${t.assignee.name ?? ""}, this task is coming up.`, type: "Type", due: "Due", contact: "Contact", phone: "Phone", notes: "Notes", open: "Open in Reymen" }
      : { subject: `Recordatorio: ${t.title}`, title: "Recordatorio de tarea", intro: `Hola ${t.assignee.name ?? ""}, tienes esta tarea pendiente.`, type: "Tipo", due: "Vence", contact: "Contacto", phone: "Teléfono", notes: "Notas", open: "Abrir en Reymen" };
    const { html, text } = renderBrandedEmail({
      preheader: `${t.title}${when ? ` · ${when}` : ""}`,
      title: L.title,
      intro: L.intro,
      rows: [
        { label: lang === "en" ? "Task" : "Tarea", value: t.title },
        { label: L.type, value: TYPE_LABEL[lang][t.type] },
        { label: L.due, value: when },
        { label: L.contact, value: t.lead?.name ?? "" },
        { label: L.phone, value: t.lead?.phone ?? "", href: t.lead?.phone ? `tel:${t.lead.phone}` : undefined },
      ],
      note: t.description ? { label: L.notes, text: t.description } : undefined,
      actions: [{ label: L.open, url: link }],
    });
    try {
      await sendEmail({ to: t.assignee.email, subject: L.subject, html, text });
      await opts.onReminder?.({ id: t.id, organizationId: t.organizationId, assigneeId: t.assigneeId, title: t.title, leadId: t.leadId, dueAt: t.dueAt });
      sent++;
    } catch {
      console.error("[tasks] reminder delivery failed");
    }
  }
  return { sent };
}
