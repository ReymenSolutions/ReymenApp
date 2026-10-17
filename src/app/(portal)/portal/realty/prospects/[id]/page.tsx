import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, Pencil } from "lucide-react";
import { getRealtyContext } from "@/lib/realty/context";
import { getProspect, listAdvisors, listOpenPropertiesForSelect } from "@/lib/realty/queries";
import { enumLabel } from "@/lib/i18n-realty";
import { dateTime, relativeDay, shortDate } from "@/lib/loyalty/format";
import { budgetText, priceText } from "@/lib/realty/page-helpers";
import { Empty, ScorePill, SectionCard, StatusBadge, Thumb } from "@/components/realty/RealtyBits";
import { MatchBreakdown } from "@/components/realty/MatchBreakdown";
import { VisitForm } from "@/components/realty/VisitForm";

export default async function ProspectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getRealtyContext();
  const { R, lang } = ctx;
  const { id } = await params;
  const p = await getProspect(ctx.orgId, id);
  if (!p) notFound();
  const [properties, advisors] = ctx.canOperate ? await Promise.all([listOpenPropertiesForSelect(ctx.orgId), listAdvisors(ctx.orgId)]) : [[], []];
  const name = p.lead?.name ?? R.prospect;
  const facts: [string, string][] = [
    [R.lookingFor, `${enumLabel(R, "type", p.propertyType)} · ${enumLabel(R, "opBuy", p.operation)}`],
    [R.budget, `${budgetText(p.minBudget, p.maxBudget)} ${p.currency}`],
    [R.zones, p.zones.map((z) => `${z.priority}. ${z.zone.name}`).join("  ") || "—"],
    [R.minBedrooms, p.minBedrooms?.toString() ?? "—"],
    [R.minBathrooms, p.minBathrooms?.toString() ?? "—"],
    [R.minArea, p.minArea ? `${p.minArea} m²` : "—"],
    [R.preferences, p.preferences.map((f) => enumLabel(R, "feat", f)).join(", ") || "—"],
    [R.moveTimeline, p.moveTimeline ?? "—"],
    [R.financing, p.financingNeeded === null ? "—" : p.financingNeeded ? R.yes : R.no],
    [R.advisor, p.advisor?.name ?? "—"],
    [R.source, p.source ?? "—"],
    [R.createdAt, relativeDay(p.createdAt, lang)],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#031738] dark:text-white">{name}</h2>
          <p className="text-sm text-slate-500">
            {[p.lead?.phone, p.lead?.email].filter(Boolean).join(" · ")} {!p.active && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{R.inactive}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {p.lead && (
            <Link href={`/portal/leads/${p.lead.id}`} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {R.openInCrm}
            </Link>
          )}
          {ctx.canOperate && (
            <Link href={`/portal/realty/prospects/${p.id}/edit`} className="inline-flex items-center gap-1.5 rounded-md bg-[#031738] px-3 py-2 text-sm font-semibold text-white hover:bg-[#04275A]">
              <Pencil className="h-4 w-4" aria-hidden="true" />
              {R.edit}
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title={R.prospectProfile} subtitle={R.crmContactNote}>
          <dl className="space-y-2 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right font-medium text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>

        <SectionCard title={R.matchesTitle} subtitle={R.matchesSubtitle} className="lg:col-span-2">
          {p.matches.length === 0 ? (
            <Empty>{R.matchesEmpty}</Empty>
          ) : (
            <ul className="space-y-3">
              {p.matches.slice(0, 8).map((m) => (
                <li key={m.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start gap-3">
                    <Thumb mediaId={m.property.media[0]?.id ?? null} alt={m.property.title} className="h-14 w-16 shrink-0 rounded" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/portal/realty/properties/${m.property.id}`} className="block truncate text-sm font-semibold text-slate-900 hover:underline">{m.property.title}</Link>
                      <p className="text-xs text-slate-500">{m.property.zone.name} · {priceText(Number(m.property.price), m.property.currency)}</p>
                      <div className="mt-1"><StatusBadge status={m.property.status} label={enumLabel(R, "st", m.property.status)} /></div>
                    </div>
                    <ScorePill value={m.totalScore} title={R.matchScore} />
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-[#063C82]">{R.matchScore} · {R.view.toLowerCase()}</summary>
                    <div className="mt-2"><MatchBreakdown R={R} m={m} /></div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title={R.visits} subtitle={R.visitAgendaNote}>
        {ctx.canOperate && p.active && properties.length > 0 && (
          <div className="mb-5 rounded-lg bg-[#F2F4F6] p-4">
            <VisitForm
              properties={[...p.matches.filter((m) => properties.some((x) => x.id === m.property.id)).map((m) => ({ id: m.property.id, title: `${m.property.title} (${m.totalScore})` })), ...properties.filter((x) => !p.matches.some((m) => m.property.id === x.id)).map((x) => ({ id: x.id, title: x.title }))]}
              prospects={[]}
              advisors={advisors}
              defaultProfileId={p.id}
              defaultAdvisorId={p.advisorUserId ?? undefined}
            />
          </div>
        )}
        {p.visits.length === 0 ? (
          <Empty>{R.visitsEmpty}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {p.visits.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/portal/realty/properties/${v.property.id}`} className="font-medium text-slate-900 hover:underline">{v.property.title}</Link>
                <span className="text-xs text-slate-500">
                  {dateTime(v.appointment.startTime, lang, ctx.org.timezone)} · {enumLabel(R, "ap", v.appointment.status)}
                  {v.outcome && ` · ${v.outcome}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        {p.closings.length > 0 && (
          <p className="mt-3 text-xs text-slate-500">
            {R.kpiClosings}: {p.closings.map((c) => `${c.property.title} · ${priceText(Number(c.finalAmount))} · ${shortDate(c.closedAt, lang)}`).join("; ")}
          </p>
        )}
      </SectionCard>
    </div>
  );
}
