import Link from "next/link";
import { Crown, Gem, TrendingDown, Repeat, Target, Gift, Clock, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Insight } from "@/lib/loyalty/metrics";
import type { LoyaltyDict } from "@/lib/i18n-loyalty";
import { money, num, pct } from "@/lib/loyalty/format";

const ICONS: Record<Insight["kind"], React.ElementType> = {
  leader_zone: Crown,
  high_value_zone: Gem,
  low_frequency_zone: Repeat,
  frequency_drop_zone: TrendingDown,
  opportunity_zone: Target,
  one_away: Gift,
  rewards_waiting: Gift,
  reactivation: Clock,
};

const TONE: Record<Insight["tone"], string> = {
  positive: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  opportunity: "bg-orange-50 text-orange-600",
  info: "bg-brand-50 text-brand-700",
};

export function insightText(i: Insight, L: LoyaltyDict): { label: string; text: string; href?: string } {
  const v = i.values;
  const cp = i.postalCode ?? "";
  const zoneHref = `/portal/food/loyalty/members?cp=${cp}`;
  switch (i.kind) {
    case "leader_zone":
      return { label: L.insightLabelLeader, text: L.insightLeader(cp, pct(Number(v.share)).replace("%", ""), money(Number(v.ticket))), href: zoneHref };
    case "high_value_zone":
      return { label: L.insightLabelHighValue, text: L.insightHighValue(cp, Number(v.members), pct(Number(v.memberShare)).replace("%", ""), num(Number(v.factor), 1)), href: zoneHref };
    case "low_frequency_zone":
      return { label: L.insightLabelLowFrequency, text: L.insightLowFrequency(cp, Number(v.members), num(Number(v.frequency), 2), num(Number(v.overall), 2)), href: zoneHref };
    case "frequency_drop_zone":
      return { label: L.insightLabelFrequencyDrop, text: L.insightFrequencyDrop(cp, Number(v.members), num(Number(v.change))), href: zoneHref };
    case "opportunity_zone":
      return { label: L.insightLabelOpportunity, text: L.insightOpportunity(cp, num(Number(v.distanceKm), 1), pct(Number(v.memberShare)).replace("%", "")), href: "/portal/food/loyalty/map" };
    case "one_away":
      return { label: L.insightLabelOneAway, text: L.insightOneAway(Number(v.count)), href: "/portal/food/loyalty/members?progress=one_away" };
    case "rewards_waiting":
      return { label: L.insightLabelRewardsWaiting, text: L.insightRewardsWaiting(Number(v.count)), href: "/portal/food/loyalty/members?reward=1" };
    case "reactivation":
      return { label: L.insightLabelReactivation, text: L.insightReactivation(Number(v.count), Number(v.days)), href: "/portal/food/loyalty/members?status=at_risk" };
  }
}

export function InsightsList({ insights, L, limit, columns = 1 }: { insights: Insight[]; L: LoyaltyDict; limit?: number; columns?: 1 | 2 | 3 }) {
  const items = limit ? insights.slice(0, limit) : insights;
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-4 text-sm text-slate-500">
        <Lightbulb className="h-4 w-4" aria-hidden="true" />
        {L.noInsights}
      </div>
    );
  }
  return (
    <ul className={cn("grid gap-2.5", columns === 2 && "md:grid-cols-2", columns === 3 && "md:grid-cols-2 xl:grid-cols-3")}>
      {items.map((i, idx) => {
        const Icon = ICONS[i.kind];
        const t = insightText(i, L);
        const body = (
          <div className="flex gap-3">
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TONE[i.tone])}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{t.label}</p>
              <p className="mt-0.5 text-sm leading-snug text-slate-800">{t.text}</p>
            </div>
          </div>
        );
        return (
          <li key={`${i.kind}-${idx}`}>
            {t.href ? (
              <Link href={t.href} className="block rounded-lg border border-slate-100 p-3 transition-colors hover:border-brand-200 hover:bg-brand-50/40">
                {body}
              </Link>
            ) : (
              <div className="rounded-lg border border-slate-100 p-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
