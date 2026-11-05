import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CalendarClock, CalendarDays, CheckCircle2, Inbox } from "lucide-react";
import type { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { can } from "@/lib/permissions";
import { getServerLang } from "@/lib/i18n-server";
import { listTasks, toTaskItem, type TaskRow } from "@/lib/tasks";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { CrmTabs } from "@/components/portal/CrmTabs";
import { TaskList } from "@/components/portal/tasks/TaskList";
import { NewTaskButton } from "@/components/portal/tasks/NewTaskButton";
import { TASK_COPY } from "@/components/portal/tasks/copy";

/** Tareas y pendientes: lo vencido arriba, luego lo de hoy, lo próximo y lo que no tiene fecha. */
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ scope?: string; assignee?: string }> }) {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!session || !orgId) return redirect("/login");
  await requireModule(orgId, "CRM");

  const { scope: scopeParam, assignee } = await searchParams;
  const role = session.user.role as UserRole;
  const canManage = can(role, "tasks:manage");
  const scope = scopeParam === "all" ? "all" : "mine";
  const [lang, org, users] = await Promise.all([
    getServerLang(),
    prisma.organization.findUnique({ where: { id: orgId }, select: { timezone: true } }),
    prisma.user.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  const t = TASK_COPY[lang === "en" ? "en" : "es"];
  const tz = org?.timezone ?? "America/Mexico_City";
  const now = new Date();
  const assigneeFilter = scope === "all" && assignee && users.some((u) => u.id === assignee) ? assignee : null;
  const view = await listTasks({ organizationId: orgId, userId: session.user.id, scope, assigneeId: assigneeFilter, timeZone: tz, now });
  const currentUser = { id: session.user.id, role };
  const openTotal = view.counts.overdue + view.counts.today + view.counts.upcoming + view.counts.noDate;

  const groups: { key: string; title: string; icon: React.ElementType; tone: string; rows: TaskRow[]; overdue?: boolean }[] = [
    { key: "overdue", title: t.overdue, icon: AlertTriangle, tone: "text-red-600", rows: view.overdue, overdue: true },
    { key: "today", title: t.today, icon: CalendarClock, tone: "text-brand-600", rows: view.today },
    { key: "upcoming", title: t.upcoming, icon: CalendarDays, tone: "text-slate-600", rows: view.upcoming },
    { key: "noDate", title: t.noDate, icon: Inbox, tone: "text-slate-500", rows: view.noDate },
    { key: "done", title: t.done, icon: CheckCircle2, tone: "text-emerald-600", rows: view.done },
  ];
  const href = (s: string, a?: string) => `/portal/tasks?scope=${s}${a ? `&assignee=${a}` : ""}`;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.title} description={t.desc} actions={canManage ? <NewTaskButton users={users} currentUser={currentUser} /> : undefined} />
      <CrmTabs />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["mine", "all"] as const).map((s) => (
          <Link key={s} href={href(s)} className={cn("rounded-full border px-3 py-1 text-sm", scope === s && !assigneeFilter ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
            {s === "mine" ? t.mine : t.all}
          </Link>
        ))}
        {scope === "all" && users.length > 1 && (
          <div className="flex flex-wrap gap-1">
            {users.map((u) => (
              <Link key={u.id} href={href("all", u.id)} className={cn("rounded-full px-2.5 py-1 text-xs", assigneeFilter === u.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                {u.name ?? u.email}
              </Link>
            ))}
          </div>
        )}
      </div>

      {openTotal === 0 && view.done.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">{t.empty}</div>
      ) : (
        <div className="space-y-4">
          {groups.filter((g) => g.rows.length > 0).map((g) => (
            <section key={g.key} className="rounded-2xl border border-slate-200 bg-white" data-testid={`tasks-${g.key}`}>
              <h2 className={cn("flex items-center gap-2 border-b border-slate-100 px-4 py-3 font-semibold", g.tone)}>
                <g.icon className="h-4 w-4" />
                {g.title}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{g.rows.length}</span>
              </h2>
              <TaskList tasks={g.rows.map(toTaskItem)} users={users} currentUser={currentUser} timeZone={tz} now={now.toISOString()} overdue={g.overdue} readOnly={!canManage} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
