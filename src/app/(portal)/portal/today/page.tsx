import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Calendar, CheckCircle2, MessageSquare, Send, TrendingUp, UserPlus } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireModule } from "@/lib/modules";
import { getServerLang } from "@/lib/i18n-server";
import { getTodayView } from "@/lib/crm-today";
import { formatMoney } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { cn } from "@/lib/utils";

const COPY = {
  es: {
    title: "Qué hago hoy",
    desc: "Lo que necesita una persona de tu equipo ahora, de lo más urgente a lo que puede esperar.",
    allDone: "Todo al día. No hay nada pendiente por ahora. 🎉",
    more: (n: number) => `y ${n} más`,
    waiting: "Clientes esperando respuesta",
    waitingHint: "Escribieron y nadie les ha contestado.",
    newLeads: "Leads nuevos sin atender",
    newLeadsHint: "Llegaron y nadie los ha contactado.",
    followUps: "Seguimientos que ya tocan",
    followUpsHint: "Según tus reglas de seguimiento.",
    appointments: "Citas de hoy",
    appointmentsHint: "Pendientes o confirmadas.",
    stale: "Oportunidades sin movimiento",
    staleHint: "Con la próxima actividad vencida o sin cambios hace una semana.",
    attempt: (n: number) => `Intento ${n}`,
    overdue: "Vencida",
    open: "Abrir",
  },
  en: {
    title: "What to do today",
    desc: "What needs a person on your team right now, from most urgent to what can wait.",
    allDone: "All caught up. Nothing is pending right now. 🎉",
    more: (n: number) => `and ${n} more`,
    waiting: "Customers waiting for a reply",
    waitingHint: "They wrote and nobody has answered.",
    newLeads: "New leads not yet handled",
    newLeadsHint: "They arrived and nobody has contacted them.",
    followUps: "Follow-ups that are due",
    followUpsHint: "According to your follow-up rules.",
    appointments: "Today's appointments",
    appointmentsHint: "Pending or confirmed.",
    stale: "Stalled opportunities",
    staleHint: "Next activity overdue or no change in a week.",
    attempt: (n: number) => `Attempt ${n}`,
    overdue: "Overdue",
    open: "Open",
  },
};

interface Row {
  key: string;
  href: string;
  title: string;
  detail?: string;
  badge?: string;
  badgeTone?: "red" | "amber";
}

function Block({ icon: Icon, title, hint, total, rows, moreLabel, tone }: { icon: React.ElementType; title: string; hint: string; total: number; rows: Row[]; moreLabel: string; tone: string }) {
  if (total === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <header className="flex items-start gap-3 border-b border-slate-100 p-4">
        <span className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">
            {title} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{total}</span>
          </h2>
          <p className="text-sm text-slate-500">{hint}</p>
        </div>
      </header>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.key}>
            <Link href={r.href} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">{r.title}</span>
                {r.detail && <span className="block truncate text-sm text-slate-500">{r.detail}</span>}
              </span>
              {r.badge && (
                <span className={cn("flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", r.badgeTone === "red" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>{r.badge}</span>
              )}
              <ArrowRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
            </Link>
          </li>
        ))}
      </ul>
      {total > rows.length && <p className="border-t border-slate-100 px-4 py-2 text-sm text-slate-500">{moreLabel}</p>}
    </section>
  );
}

function timeIn(date: Date, timeZone: string, lang: "es" | "en"): string {
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", { hour: "numeric", minute: "2-digit", timeZone }).format(date);
}

function ago(date: Date, lang: "es" | "en"): string {
  const mins = Math.max(0, Math.round((Date.now() - date.getTime()) / 60_000));
  const [n, unit] = mins < 60 ? [mins, "min"] : mins < 1440 ? [Math.round(mins / 60), "h"] : [Math.round(mins / 1440), "d"];
  return lang === "en" ? `${n} ${unit} ago` : `hace ${n} ${unit}`;
}

/** "Qué hago hoy": una sola pantalla con lo que necesita a una persona del equipo. */
export default async function TodayPage() {
  const session = await auth();
  const orgId = session?.user.organizationId;
  if (!session || !orgId) return redirect("/login");
  await requireModule(orgId, "CRM");

  const [lang, org] = await Promise.all([getServerLang(), prisma.organization.findUnique({ where: { id: orgId }, select: { timezone: true } })]);
  const l = lang === "en" ? "en" : "es";
  const t = COPY[l];
  const tz = org?.timezone ?? "America/Mexico_City";
  const view = await getTodayView(orgId, tz);

  const total = view.waiting.total + view.newLeads.total + view.followUps.total + view.appointments.total + view.staleOpportunities.total;
  const more = (shown: number, all: number) => t.more(all - shown);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t.title} description={t.desc} />

      {total === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
          <CheckCircle2 className="h-6 w-6 flex-shrink-0" />
          <p className="font-medium">{t.allDone}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Block
            icon={MessageSquare}
            tone="bg-red-50 text-red-600"
            title={t.waiting}
            hint={t.waitingHint}
            total={view.waiting.total}
            moreLabel={more(view.waiting.items.length, view.waiting.total)}
            rows={view.waiting.items.map((w) => ({ key: w.id, href: `/portal/conversations/${w.id}`, title: w.name, detail: w.preview, badge: ago(w.since, l), badgeTone: "red" }))}
          />
          <Block
            icon={UserPlus}
            tone="bg-amber-50 text-amber-600"
            title={t.newLeads}
            hint={t.newLeadsHint}
            total={view.newLeads.total}
            moreLabel={more(view.newLeads.items.length, view.newLeads.total)}
            rows={view.newLeads.items.map((n) => ({ key: n.id, href: `/portal/leads/${n.id}`, title: n.name, detail: n.source ?? undefined, badge: ago(n.createdAt, l), badgeTone: "amber" }))}
          />
          <Block
            icon={Calendar}
            tone="bg-brand-50 text-brand-600"
            title={t.appointments}
            hint={t.appointmentsHint}
            total={view.appointments.total}
            moreLabel={more(view.appointments.items.length, view.appointments.total)}
            rows={view.appointments.items.map((a) => ({ key: a.id, href: "/portal/appointments", title: a.title, detail: a.leadName ?? undefined, badge: timeIn(a.startTime, tz, l) }))}
          />
          <Block
            icon={Send}
            tone="bg-amber-50 text-amber-600"
            title={t.followUps}
            hint={t.followUpsHint}
            total={view.followUps.total}
            moreLabel={more(view.followUps.items.length, view.followUps.total)}
            rows={view.followUps.items.map((f) => ({ key: `${f.leadId}-${f.attempt}`, href: `/portal/leads/${f.leadId}`, title: f.name, badge: t.attempt(f.attempt) }))}
          />
          <Block
            icon={TrendingUp}
            tone="bg-slate-100 text-slate-600"
            title={t.stale}
            hint={t.staleHint}
            total={view.staleOpportunities.total}
            moreLabel={more(view.staleOpportunities.items.length, view.staleOpportunities.total)}
            rows={view.staleOpportunities.items.map((o) => ({
              key: o.id,
              href: `/portal/leads/${o.leadId}`,
              title: o.title,
              detail: `${o.leadName}${o.amount ? ` · ${formatMoney(o.amount)}` : ""}`,
              badge: o.overdue ? t.overdue : ago(o.since, l),
              badgeTone: o.overdue ? "red" : "amber",
            }))}
          />
        </div>
      )}
    </div>
  );
}
