"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferences } from "@/context/preferences";
import { createTask, updateTask } from "@/actions/tasks";
import { searchLeads } from "@/actions/leads";
import { getErrorMessage } from "@/lib/user-error";
import { TASK_COPY, TASK_PRIORITY_LABEL, TASK_TYPE_LABEL, type TaskLang } from "./copy";

const TYPES = ["CALL", "WHATSAPP", "EMAIL", "MEETING", "VISIT", "OTHER"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
const REMINDERS = ["none", "0", "15", "60", "1440"] as const;

export interface TaskUserOption { id: string; name: string | null; email: string }
export interface TaskLeadOption { id: string; name: string; email?: string | null; phone?: string | null }

/** Lo que el formulario necesita para editar una tarea existente. */
export interface TaskFormValue {
  id: string;
  title: string;
  description: string | null;
  type: (typeof TYPES)[number];
  priority: (typeof PRIORITIES)[number];
  dueAt: string | null;
  reminderMinutes: number | null;
  assigneeId: string | null;
  lead: TaskLeadOption | null;
  opportunityId: string | null;
}

/** ISO → valor de <input type="datetime-local"> en la hora del navegador. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TaskFormDialog({
  users,
  currentUser,
  fixedLead,
  opportunities,
  task,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  users: TaskUserOption[];
  currentUser: { id: string; role: string };
  /** Desde la ficha de un contacto: no se busca contacto. */
  fixedLead?: TaskLeadOption;
  /** Oportunidades del contacto fijo, para ligarla a una. */
  opportunities?: { id: string; title: string }[];
  task?: TaskFormValue;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { lang } = usePreferences();
  const l: TaskLang = lang === "en" ? "en" : "es";
  const t = TASK_COPY[l];
  const [innerOpen, setInnerOpen] = useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  const [isPending, startTransition] = useTransition();
  const agentOnly = currentUser.role === "AGENT";

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [type, setType] = useState<(typeof TYPES)[number]>(task?.type ?? "CALL");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>(task?.priority ?? "NORMAL");
  const [due, setDue] = useState(toLocalInput(task?.dueAt ?? null));
  const [reminder, setReminder] = useState<string>(task ? (task.reminderMinutes === null ? "none" : String(task.reminderMinutes)) : "15");
  const [assigneeId, setAssigneeId] = useState<string>(task ? (task.assigneeId ?? "none") : currentUser.id);
  const [lead, setLead] = useState<TaskLeadOption | null>(fixedLead ?? task?.lead ?? null);
  const [opportunityId, setOpportunityId] = useState<string>(task?.opportunityId ?? "none");
  const [leadQuery, setLeadQuery] = useState("");
  const [leadResults, setLeadResults] = useState<TaskLeadOption[]>([]);

  async function handleLeadSearch(q: string) {
    setLeadQuery(q);
    if (q.trim().length < 2) return setLeadResults([]);
    try {
      setLeadResults(await searchLeads(q));
    } catch {
      setLeadResults([]);
    }
  }

  function reset() {
    if (task) return;
    setTitle(""); setDescription(""); setType("CALL"); setPriority("NORMAL"); setDue(""); setReminder("15");
    setAssigneeId(currentUser.id); setOpportunityId("none"); setLeadQuery(""); setLeadResults([]);
    if (!fixedLead) setLead(null);
  }

  function submit() {
    if (!title.trim()) return toast.error(t.titleRequired);
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      type,
      priority,
      dueAt: due ? new Date(due).toISOString() : null,
      reminderMinutes: due && reminder !== "none" ? Number(reminder) : null,
      assigneeId: assigneeId === "none" ? null : assigneeId,
      leadId: lead?.id ?? null,
      opportunityId: opportunityId === "none" ? null : opportunityId,
    };
    startTransition(async () => {
      try {
        if (task) await updateTask(task.id, payload);
        else await createTask(payload);
        toast.success(task ? t.saved : t.created);
        setOpen(false);
        reset();
      } catch (e) {
        toast.error(getErrorMessage(e, t.saveError));
      }
    });
  }

  const assignable = agentOnly ? users.filter((u) => u.id === currentUser.id || u.id === task?.assigneeId) : users;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? t.editTask : t.newTask}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">{t.what} *</Label>
            <Input id="task-title" placeholder={t.titlePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-type">{t.type}</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                <SelectTrigger id="task-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((k) => <SelectItem key={k} value={k}>{TASK_TYPE_LABEL[l][k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-priority">{t.priority}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                <SelectTrigger id="task-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((k) => <SelectItem key={k} value={k}>{TASK_PRIORITY_LABEL[l][k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-due">{t.due}</Label>
              <Input id="task-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-reminder">{t.reminder}</Label>
              <Select value={reminder} onValueChange={setReminder} disabled={!due}>
                <SelectTrigger id="task-reminder"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REMINDERS.map((k) => <SelectItem key={k} value={k}>{t.reminderOption(k)}</SelectItem>)}
                  {!(REMINDERS as readonly string[]).includes(reminder) && <SelectItem value={reminder}>{t.reminderOption(reminder)}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-assignee">{t.assignee}</Label>
            <Select value={assigneeId} onValueChange={setAssigneeId} disabled={agentOnly && assignable.length <= 1}>
              <SelectTrigger id="task-assignee"><SelectValue /></SelectTrigger>
              <SelectContent>
                {!agentOnly && <SelectItem value="none">{t.unassigned}</SelectItem>}
                {assignable.map((u) => <SelectItem key={u.id} value={u.id}>{u.id === currentUser.id ? `${u.name ?? u.email} (${t.me})` : (u.name ?? u.email)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!fixedLead && (
            <div className="space-y-2">
              <Label>{t.contact}</Label>
              {lead ? (
                <div className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                  <span>{lead.name}</span>
                  <button type="button" onClick={() => { setLead(null); setOpportunityId("none"); }} className="text-xs text-slate-400 hover:text-slate-600">{t.change}</button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-9" placeholder={t.searchContact} value={leadQuery} onChange={(e) => handleLeadSearch(e.target.value)} />
                  {leadResults.length > 0 && (
                    <div className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm">
                      {leadResults.map((r) => (
                        <button key={r.id} type="button" onClick={() => { setLead(r); setLeadResults([]); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                          <p className="font-medium text-slate-900">{r.name}</p>
                          <p className="text-xs text-slate-400">{r.email ?? r.phone ?? ""}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {fixedLead && opportunities && opportunities.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="task-opportunity">{t.opportunity}</Label>
              <Select value={opportunityId} onValueChange={setOpportunityId}>
                <SelectTrigger id="task-opportunity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t.noOpportunity}</SelectItem>
                  {opportunities.map((o) => <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="task-notes">{t.notes}</Label>
            <Textarea id="task-notes" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t.cancel}</Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {task ? t.save : t.create}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
