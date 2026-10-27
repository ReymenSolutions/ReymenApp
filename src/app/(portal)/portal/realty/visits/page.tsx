import Link from "next/link";
import { getRealtyContext } from "@/lib/realty/context";
import { listActiveProspectsForSelect, listAdvisors, listOpenPropertiesForSelect, listVisits } from "@/lib/realty/queries";
import { enumLabel } from "@/lib/i18n-realty";
import { dateTime } from "@/lib/loyalty/format";
import { Empty, SectionCard } from "@/components/realty/RealtyBits";
import { VisitActions, VisitForm } from "@/components/realty/VisitForm";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;

export default async function VisitsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const ctx = await getRealtyContext();
  const { R, lang } = ctx;
  const sp = await searchParams;
  const view = sp.view === "past" ? "past" : "upcoming";
  const now = new Date();
  const range = view === "past" ? { from: new Date(now.getTime() - 90 * DAY), to: now } : { from: new Date(now.getTime() - 2 * 3_600_000), to: new Date(now.getTime() + 60 * DAY) };
  const [rows, properties, prospects, advisors] = await Promise.all([
    listVisits(ctx.orgId, range),
    ctx.canOperate ? listOpenPropertiesForSelect(ctx.orgId) : Promise.resolve([]),
    ctx.canOperate ? listActiveProspectsForSelect(ctx.orgId) : Promise.resolve([]),
    listAdvisors(ctx.orgId),
  ]);
  const advisorName = new Map(advisors.map((a) => [a.id, a.name ?? a.email]));
  const list = view === "past" ? [...rows].reverse() : rows;

  return (
    <div className="space-y-6">
      {ctx.canOperate && properties.length > 0 && (
        <SectionCard title={R.newVisit} subtitle={R.visitAgendaNote}>
          <VisitForm properties={properties.map((p) => ({ id: p.id, title: p.title, hint: [p.zone?.name, enumLabel(R, "op", p.operation)].filter(Boolean).join(" · ") }))} prospects={prospects.map((p) => ({ id: p.id, name: p.lead?.name ?? R.prospect, hint: [p.lead?.phone, enumLabel(R, "opBuy", p.operation)].filter(Boolean).join(" · ") }))} advisors={advisors} defaultAdvisorId={ctx.userId} />
        </SectionCard>
      )}
      <SectionCard title={R.visits}>
        <div className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 sm:w-fit">
          {(["upcoming", "past"] as const).map((v) => (
            <Link key={v} href={`/portal/realty/visits?view=${v}`} className={cn("flex-1 rounded-md px-3 py-1 text-center text-xs font-medium", view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}>
              {v === "upcoming" ? R.upcoming : R.past}
            </Link>
          ))}
        </div>
        {list.length === 0 ? (
          <Empty>{R.visitsEmpty}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    <Link href={`/portal/realty/properties/${v.property.id}`} className="hover:underline">{v.property.title}</Link>
                    <span className="font-normal text-slate-500"> · {v.property.zone.name}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {dateTime(v.appointment.startTime, lang, ctx.org.timezone)} · {v.profile ? <Link href={`/portal/realty/prospects/${v.profile.id}`} className="hover:underline">{v.profile.lead?.name ?? R.prospect}</Link> : "—"}
                    {v.advisorUserId && ` · ${advisorName.get(v.advisorUserId) ?? ""}`} · <strong>{enumLabel(R, "ap", v.appointment.status)}</strong>
                    {v.outcome && ` · ${v.outcome}`}
                  </p>
                </div>
                {ctx.canOperate && <VisitActions visitId={v.id} status={v.appointment.status} outcome={v.outcome} />}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
