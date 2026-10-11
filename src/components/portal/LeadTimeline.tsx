import Link from "next/link";
import { AlertTriangle, Bot, Calendar, GitBranch, MessageSquare, Send, Sparkles, StickyNote, UserCheck, UserPlus, XCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/utils";
import type { LeadTimelineEvent } from "@/lib/lead-timeline";

const COPY = {
  es: {
    empty: "Sin actividad todavía",
    created: (source: string | null) => `Llegó${source ? ` por ${source}` : ""}`,
    statusChange: "Estado",
    by: "por",
    viaPipeline: "desde el pipeline",
    note: "Nota de",
    customer: "Cliente",
    ai: "Asistente IA",
    team: "Equipo",
    escalated: "La conversación se pasó a una persona del equipo",
    appointment: "Cita",
    followUp: "Seguimiento enviado",
    oppCreated: "Oportunidad creada",
    movedTo: "movida a",
    lost: "perdida",
    reason: "Motivo",
    more: "Ver actividad anterior",
  },
  en: {
    empty: "No activity yet",
    created: (source: string | null) => `Arrived${source ? ` via ${source}` : ""}`,
    statusChange: "Status",
    by: "by",
    viaPipeline: "from the pipeline",
    note: "Note by",
    customer: "Customer",
    ai: "AI assistant",
    team: "Team",
    escalated: "The conversation was handed to a team member",
    appointment: "Appointment",
    followUp: "Follow-up sent",
    oppCreated: "Opportunity created",
    movedTo: "moved to",
    lost: "lost",
    reason: "Reason",
    more: "Show earlier activity",
  },
};

const ICON: Record<LeadTimelineEvent["type"], LucideIcon> = {
  created: UserPlus,
  status_change: UserCheck,
  note: StickyNote,
  message: MessageSquare,
  escalated: AlertTriangle,
  appointment: Calendar,
  follow_up: Send,
  opportunity_created: Sparkles,
  stage_change: GitBranch,
  opportunity_lost: XCircle,
};

function messageBadge(role: string, t: (typeof COPY)["es"]) {
  if (role === "USER") return { label: t.customer, variant: "info" as const, Icon: MessageSquare };
  if (role === "AGENT") return { label: t.team, variant: "secondary" as const, Icon: MessageSquare };
  return { label: t.ai, variant: "secondary" as const, Icon: Bot };
}

/** Línea de tiempo del contacto: una sola secuencia con todo lo que ha pasado. */
export function LeadTimeline({ events, hasMore, moreHref, lang }: { events: LeadTimelineEvent[]; hasMore: boolean; moreHref: string; lang: "es" | "en" }) {
  const t = COPY[lang];
  if (events.length === 0) return <p className="text-xs text-slate-400">{t.empty}</p>;

  return (
    <div>
      <ol className="space-y-3">
        {events.map((event, i) => {
          const Icon = event.type === "message" ? messageBadge(event.role, t).Icon : ICON[event.type];
          return (
            <li key={i} className="flex gap-2.5 text-sm">
              <div className="mt-0.5 flex-shrink-0 text-slate-400">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                {event.type === "created" && <div className="text-slate-700">{t.created(event.source)}</div>}
                {event.type === "status_change" && (
                  <div className="text-slate-700">
                    {t.statusChange}: {event.from && <><StatusBadge status={event.from} /> → </>}
                    <StatusBadge status={event.to} />
                    {(event.actorName || event.viaPipeline) && (
                      <span className="text-slate-400">
                        {event.actorName && <> {t.by} {event.actorName}</>}
                        {event.viaPipeline && <> · {t.viaPipeline}</>}
                      </span>
                    )}
                  </div>
                )}
                {event.type === "note" && (
                  <div className="text-slate-700">
                    {t.note} {event.authorName ?? "—"}: <span className="text-slate-500">{event.content}</span>
                  </div>
                )}
                {event.type === "message" && (
                  <div className="text-slate-700">
                    <Badge variant={messageBadge(event.role, t).variant} className="mr-1.5 text-[10px]">{messageBadge(event.role, t).label}</Badge>
                    {event.content}
                  </div>
                )}
                {event.type === "escalated" && <div className="text-slate-700">{t.escalated}</div>}
                {event.type === "appointment" && (
                  <div className="text-slate-700">
                    {t.appointment}: {event.title} <StatusBadge status={event.status} />
                  </div>
                )}
                {event.type === "follow_up" && (
                  <div className="text-slate-700">
                    {t.followUp}
                    {event.ruleName && <span className="text-slate-500"> · {event.ruleName}</span>}
                  </div>
                )}
                {event.type === "opportunity_created" && (
                  <div className="text-slate-700">
                    {t.oppCreated}: <span className="font-medium">{event.title}</span>
                  </div>
                )}
                {event.type === "stage_change" && (
                  <div className="text-slate-700">
                    {event.opportunityTitle} {t.movedTo} <span className="font-medium">{event.toStageName}</span>
                  </div>
                )}
                {event.type === "opportunity_lost" && (
                  <div className="text-slate-700">
                    {event.opportunityTitle} {t.lost}
                    {event.reason && <span className="text-slate-500"> · {t.reason}: {event.reason}</span>}
                  </div>
                )}
                <p className="text-xs text-slate-400">{formatDateTime(event.date)}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {hasMore && (
        <Link href={moreHref} scroll={false} className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
          {t.more}
        </Link>
      )}
    </div>
  );
}
