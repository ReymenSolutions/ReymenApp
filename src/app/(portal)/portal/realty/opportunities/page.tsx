import Link from "next/link";
import { getRealtyContext } from "@/lib/realty/context";
import { analyze, loadSnapshot } from "@/lib/realty/queries";
import { enumLabel } from "@/lib/i18n-realty";
import { bandLabel } from "@/lib/realty/constants";
import { STAGNANT_DAYS, ZONE_SCORE_WEIGHTS } from "@/lib/realty/scores";
import { priceText } from "@/lib/realty/page-helpers";
import { Empty, ScoreBar, ScorePill, SectionCard, StatusBadge, Thumb } from "@/components/realty/RealtyBits";

const DAY = 86_400_000;

export default async function OpportunitiesPage() {
  const ctx = await getRealtyContext();
  const { R } = ctx;
  const now = new Date();
  const snap = await loadSnapshot(ctx.orgId, now);
  const a = analyze(snap, { from: new Date(now.getTime() - 30 * DAY), to: now });
  const zoneName = new Map(snap.zones.map((z) => [z.id, z.name]));

  const PropertyRow = ({ p, extra }: { p: (typeof snap.properties)[number]; extra: React.ReactNode }) => (
    <li>
      <Link href={`/portal/realty/properties/${p.id}`} className="flex items-center gap-3 rounded-lg border border-slate-200 p-2 hover:border-[#063C82]">
        <Thumb mediaId={p.coverId} alt={p.title} className="h-14 w-16 shrink-0 rounded" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{p.title}</p>
          <p className="truncate text-xs text-slate-500">{zoneName.get(p.zoneId)} · {priceText(p.price, p.currency)}</p>
          <p className="mt-0.5 text-xs text-slate-600">{extra}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ScorePill value={a.scores.get(p.id)?.total ?? null} title={R.opportunityScore} />
          <StatusBadge status={p.status} label={enumLabel(R, "st", p.status)} />
        </div>
      </Link>
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title={R.boostTitle} subtitle={R.boostSubtitle}>
          {a.boost.length === 0 ? (
            <Empty>{R.emptyList}</Empty>
          ) : (
            <ul className="space-y-2">
              {a.boost.slice(0, 8).map((p) => {
                const s = a.scores.get(p.id)!;
                return <PropertyRow key={p.id} p={p} extra={`${s.facts.demand} ${R.prospects.toLowerCase()} · ${s.facts.fitting} ${R.budget.toLowerCase()} OK · ${s.facts.points} ${R.points}`} />;
              })}
            </ul>
          )}
        </SectionCard>
        <SectionCard title={R.stagnantTitle} subtitle={R.stagnantSubtitle(STAGNANT_DAYS)}>
          {a.stagnant.length === 0 ? (
            <Empty>{R.emptyList}</Empty>
          ) : (
            <ul className="space-y-2">
              {a.stagnant.slice(0, 8).map((p) => {
                const s = a.scores.get(p.id)!;
                const pi = a.priceInsightFor(p.id);
                const why = a.stagnationFor(p.id);
                return <PropertyRow key={p.id} p={p} extra={`${why ? `${enumLabel(R, "st", why)} · ` : ""}${R.daysListed(s.facts.days)} · ${s.facts.points} ${R.points}${pi && pi.position !== "INSUFFICIENT" ? ` · ${R.priceInsight}: ${enumLabel(R, "pi", pi.position)}` : ""}`} />;
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title={R.sourcingTitle} subtitle={R.sourcingSubtitle}>
        {a.sourcing.length === 0 ? (
          <Empty>{R.emptyList}</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {a.sourcing.map((s) => (
              <li key={`${s.zoneId}-${s.operation}-${s.propertyType}-${s.band.key}`} className="rounded-lg border border-[#063C82]/20 bg-[#F2F4F6] p-3">
                <p className="text-sm font-semibold text-[#031738]">{enumLabel(R, "type", s.propertyType)} · {enumLabel(R, "op", s.operation)}</p>
                <p className="text-sm text-slate-700">{s.zoneName} · {bandLabel(s.band)}</p>
                <p className="mt-2 text-xs text-slate-600">
                  <strong className="text-lg text-[#063C82]">{s.demand}</strong> {R.prospects.toLowerCase()} · <strong className="text-lg text-slate-900">{s.supply}</strong> {R.properties.toLowerCase()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title={R.zoneScoreTitle} subtitle={R.zoneScoreSubtitle}>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {a.zoneScores.map((z) => (
            <li key={z.zoneId} className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{z.zoneName}</p>
                <ScorePill value={z.total} />
              </div>
              <div className="space-y-1">
                <ScoreBar stacked label={`${R.demand} · ${ZONE_SCORE_WEIGHTS.pressure}%`} value={z.pressure} />
                <ScoreBar stacked label={`${R.scoreGrowth} · ${ZONE_SCORE_WEIGHTS.growth}%`} value={z.growth} />
                <ScoreBar stacked label={`${R.scoreInterest} · ${ZONE_SCORE_WEIGHTS.engagement}%`} value={z.engagement} />
                <ScoreBar stacked label={`${R.scoreUnmet} · ${ZONE_SCORE_WEIGHTS.unmet}%`} value={z.unmet} />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                {z.facts.demand} {R.prospects.toLowerCase()} · {z.facts.supply} {R.supply.toLowerCase()} · {z.facts.prevDemand} → {z.facts.newDemand} · {z.facts.points} {R.points}
              </p>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}
