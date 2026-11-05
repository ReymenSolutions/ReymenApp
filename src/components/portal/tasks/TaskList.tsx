"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Calendar, Circle, CheckCircle2, Flag, Mail, MapPin, MessageCircle, Pencil, Phone, Trash2, Users, ListTodo } from "lucide-react";
import { toast } from "sonner";
import { usePreferences } from "@/context/preferences";
import { deleteTask, setTaskDone } from "@/actions/tasks";
import { getErrorMessage } from "@/lib/user-error";
import { cn } from "@/lib/utils";
import type { TaskItem } from "@/lib/tasks";
import { TaskFormDialog, type TaskUserOption } from "./TaskFormDialog";
import { TASK_COPY, TASK_TYPE_LABEL, type TaskLang } from "./copy";

const TYPE_ICON = { CALL: Phone, WHATSAPP: MessageCircle, EMAIL: Mail, MEETING: Users, VISIT: MapPin, OTHER: ListTodo } as const;

function formatDue(iso: string, timeZone: string, lang: TaskLang): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}

function TaskRowView({ task, users, currentUser, timeZone, overdue, showLead, opportunities, readOnly }: {
  task: TaskItem;
  users: TaskUserOption[];
  currentUser: { id: string; role: string };
  timeZone: string;
  overdue?: boolean;
  showLead: boolean;
  opportunities?: { id: string; title: string }[];
  readOnly?: boolean;
}) {
  const { lang } = usePreferences();
  const l: TaskLang = lang === "en" ? "en" : "es";
  const t = TASK_COPY[l];
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const done = task.status !== "OPEN";
  const editable = !readOnly && currentUser.role !== "AGENT" || task.assigneeId === currentUser.id || task.createdById === currentUser.id;
  const Icon = TYPE_ICON[task.type];

  function toggle() {
    startTransition(async () => {
      try {
        await setTaskDone(task.id, !done);
      } catch (e) {
        toast.error(getErrorMessage(e, t.saveError));
      }
    });
  }

  function remove() {
    if (!confirm(t.confirmDelete)) return;
    startTransition(async () => {
      try {
        await deleteTask(task.id);
        toast.success(t.deleted);
      } catch (e) {
        toast.error(getErrorMessage(e, t.saveError));
      }
    });
  }

  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", pending && "opacity-60")} data-testid="task-row">
      <button
        type="button"
        onClick={toggle}
        disabled={!editable || pending}
        aria-label={done ? t.reopen : t.markDone}
        title={done ? t.reopen : t.markDone}
        className="mt-0.5 flex-shrink-0 text-slate-400 hover:text-emerald-600 disabled:cursor-not-allowed"
      >
        {done ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <Circle className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium text-slate-900", done && "text-slate-400 line-through")}>
          {task.priority === "HIGH" && !done && <Flag className="mr-1 inline h-3.5 w-3.5 text-red-500" aria-label={t.high} />}
          {task.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" />{TASK_TYPE_LABEL[l][task.type]}</span>
          {task.dueAt && (
            <span className={cn("inline-flex items-center gap-1", overdue && !done && "font-medium text-red-600")}>
              <Calendar className="h-3.5 w-3.5" />{formatDue(task.dueAt, timeZone, l)}
            </span>
          )}
          {showLead && task.lead && <Link href={`/portal/leads/${task.lead.id}`} className="text-brand-600 hover:underline">{task.lead.name}</Link>}
          {task.opportunity && <span>· {task.opportunity.title}</span>}
          <span>· {task.assigneeName ?? t.unassigned}</span>
        </p>
        {task.description && <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-slate-600">{task.description}</p>}
      </div>
      {task.lead?.phone && task.type === "WHATSAPP" && !done && (
        <a href={`https://wa.me/${task.lead.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="rounded-md p-1.5 text-emerald-600 hover:bg-emerald-50" aria-label="WhatsApp">
          <MessageCircle className="h-4 w-4" />
        </a>
      )}
      {task.lead?.phone && task.type === "CALL" && !done && (
        <a href={`tel:${task.lead.phone}`} className="rounded-md p-1.5 text-brand-600 hover:bg-brand-50" aria-label={TASK_TYPE_LABEL[l].CALL}>
          <Phone className="h-4 w-4" />
        </a>
      )}
      {editable && (
        <>
          <button type="button" onClick={() => setEditing(true)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label={t.edit} title={t.edit}>
            <Pencil className="h-4 w-4" />
          </button>
          <button type="button" onClick={remove} disabled={pending} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={t.remove} title={t.remove}>
            <Trash2 className="h-4 w-4" />
          </button>
        </>
      )}
      {editing && (
        <TaskFormDialog
          open={editing}
          onOpenChange={setEditing}
          users={users}
          currentUser={currentUser}
          fixedLead={showLead ? undefined : task.lead ?? undefined}
          opportunities={opportunities}
          task={{ id: task.id, title: task.title, description: task.description, type: task.type, priority: task.priority, dueAt: task.dueAt, reminderMinutes: task.reminderMinutes, assigneeId: task.assigneeId, lead: task.lead, opportunityId: task.opportunity?.id ?? null }}
        />
      )}
    </li>
  );
}

/** Lista de tareas con marcar/editar/eliminar. `showLead` muestra el contacto (no hace falta dentro de su ficha). */
export function TaskList({ tasks, users, currentUser, timeZone, now, overdue, showLead = true, opportunities, emptyText, readOnly }: {
  tasks: TaskItem[];
  users: TaskUserOption[];
  currentUser: { id: string; role: string };
  timeZone: string;
  /** Instante de referencia (ISO) que manda el servidor, para que servidor y navegador pinten igual lo vencido. */
  now: string;
  overdue?: boolean;
  showLead?: boolean;
  opportunities?: { id: string; title: string }[];
  emptyText?: string;
  /** Sin permiso de tareas (Visor): solo se ven. */
  readOnly?: boolean;
}) {
  if (tasks.length === 0) return emptyText ? <p className="px-4 py-3 text-sm text-slate-500">{emptyText}</p> : null;
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.map((task) => (
        <TaskRowView key={task.id} task={task} users={users} currentUser={currentUser} timeZone={timeZone} overdue={overdue || (!!task.dueAt && task.status === "OPEN" && task.dueAt < now)} showLead={showLead} opportunities={opportunities} readOnly={readOnly} />
      ))}
    </ul>
  );
}
