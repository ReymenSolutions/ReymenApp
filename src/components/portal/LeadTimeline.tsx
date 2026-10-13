import Link from "next/link";
import { AlertTriangle, Bot, Calendar, GitBranch, MessageSquare, Send, ShoppingBag, Sparkles, StickyNote, UserCheck, UserPlus, XCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn, formatDateTime, formatMoney } from "@/lib/utils";
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
    ai: "Agente IA",
    team: "Equipo",
    escalated: "La conversación se pasó a una persona del equipo",
    appointment: "Cita",
    followUp: "Seguimiento enviado",
    oppCreated: "Oportunidad creada",
    movedTo: "movida a",
    lost: "perdida",
    reason: "Motivo",
    purchase: "Compra en el negocio",
    purchaseCancelled: "Compra cancelada",
    aiCreate: (title: string, to: string | null) => `Creó la oportunidad «${title}» en ${to}`,
    aiAdvance: (title: string, from: string | null, to: string | null) => `Movió «${title}» de ${from} a ${to}`,
    aiCloseWon: (title: string) => `Sugirió cerrar «${title}» como ganada`,
    aiCloseLost: (title: string) => `Sugirió cerrar «${title}» como perdida`,
    aiUndone: "Deshecho",
    aiRejected: "Descartada",
    aiAccepted: "Aplicada por una persona",
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
    purchase: "Purchase at the business",
    purchaseCancelled: "Purchase cancelled",
    aiCreate: (title: string, to: string | null) => `Created opportunity “${title}” at ${to}`,
    aiAdvance: (title: string, from: string | null, to: string | null) => `Moved “${title}” from ${from} to ${to}`,
    aiCloseWon: (title: string) => `Suggested closing “${title}” as won`,
    aiCloseLost: (title: string) => `Suggested closing “${title}” as lost`,
    aiUndone: "Undone",
    aiRejected: "Dismissed",
    aiAccepted: "Applied by a person",
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
  purchase: ShoppingBag,
  ai_action: Bot,
};

function messageBadge(role: string, t: (typeof COPY)["es"]) {
  if (role === "USER") return { label: t.customer, variant: "info" as const, Icon: MessageSquare };
  if (role === "AGENT") return { label: t.team, variant: "secondary" as const, Icon: MessageSquare };
  return { label: t.ai, variant: "secondary" as const, Icon: Bot };
}

/** Línea de tiempo del contacto: una sola secuencia con todo lo que ha pasado. */
export function LeadTimeline({ events, hasMore, moreHref, lang, animateAfter }: { events: LeadTimelineEvent[]; hasMore: boolean; moreHref: string; lang: "es" | "en"; animateAfter?: number }) {
  const t = COPY[lang];
  if (events.length === 0) return <p className="text-xs text-slate-400">{t.empty}</p>;
  // Llaves estables (tipo + hora, con contador si se repiten): un evento nuevo al inicio se monta como
  // elemento nuevo en lugar de reutilizar el de la misma posición, y así puede entrar con animación.
  const seen = new Map<string, number>();
  const keyOf = (e: LeadTimelineEvent) => {
    const base = `${e.type}:${new Date(e.date).getTime()}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}:${n}`;
  };

  return (
    <div>
      <ol className="space-y-3">
        {events.map((event) => {
          const Icon = event.type === "message" ? messageBadge(event.role, t).Icon : ICON[event.type];
          const fresh = animateAfter !== undefined && new Date(event.date).getTime() >= animateAfter;
          return (
            <li key={keyOf(event)} className={cn("relative flex gap-2.5 text-sm", "[&:not(:last-child)]:before:absolute [&:not(:last-child)]:before:left-3 [&:not(:last-child)]:before:top-7 [&:not(:last-child)]:before:-bottom-3 [&:not(:last-child)]:before:w-px [&:not(:last-child)]:before:bg-slate-200", fresh && "animate-note-in")}>
              <div className="relative z-10 mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Icon className="h-3.5 w-3.5" />
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
                {event.type === "purchase" && (
                  <div className="text-slate-700">
                    {event.cancelled ? t.purchaseCancelled : t.purchase}: <span className={event.cancelled ? "font-medium text-red-600" : "font-medium"}>{formatMoney(event.amount)}</span>
                  </div>
                )}
                {event.type === "ai_action" && (
                  <div className="text-slate-700">
                    <Badge variant="secondary" className="mr-1.5 text-[10px]">{t.ai}</Badge>
                    {event.kind === "CREATE_OPPORTUNITY" && t.aiCreate(event.opportunityTitle, event.toStageName)}
                    {event.kind === "ADVANCE_STAGE" && t.aiAdvance(event.opportunityTitle, event.fromStageName, event.toStageName)}
                    {event.kind === "CLOSE_WON" && t.aiCloseWon(event.opportunityTitle)}
                    {event.kind === "CLOSE_LOST" && t.aiCloseLost(event.opportunityTitle)}
                    {event.status === "UNDONE" && <span className="text-slate-400"> · {t.aiUndone}</span>}
                    {event.status === "REJECTED" && <span className="text-slate-400"> · {t.aiRejected}</span>}
                    {event.status === "ACCEPTED" && <span className="text-slate-400"> · {t.aiAccepted}</span>}
                    <span className="block text-xs text-slate-500">{t.reason}: {event.reason}</span>
                  </div>
                )}
                {event.type === "opportunity_lost" && (
                  <div className="text-slate-700">
                    {event.opportunityTitle} {t.lost}
                    {event.reason && <span className="text-slate-500"> · {t.reason}: {event.reason}</span>}
                  </div>
                )}
                <p className="text-xs text-slate-400">{formatDateTime(event.date, lang)}</p>
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
