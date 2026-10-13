import Link from "next/link";
import type { SegmentCounts, SegmentKey } from "@/lib/loyalty/metrics";
import { ACTIVE_DAYS } from "@/lib/loyalty/metrics";
import type { LoyaltyDict } from "@/lib/i18n-loyalty";
import { num } from "@/lib/loyalty/format";

/** Clientes activos / en riesgo / inactivos (barra 100%) + segmentos consultables. */
export function ActivityBar({ segments, L }: { segments: SegmentCounts; L: LoyaltyDict }) {
  const total = Math.max(1, segments.total);
  const parts = [
    { key: "active", label: L.activityActive, value: segments.active, cls: "bg-emerald-500", href: "?status=active" },
    { key: "at_risk", label: L.activityAtRisk, value: segments.atRisk, cls: "bg-amber-400", href: "?status=at_risk" },
    { key: "inactive", label: L.activityInactive, value: segments.inactive, cls: "bg-slate-300", href: "?status=inactive" },
  ];
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
        {parts.map((p) =>
          p.value > 0 ? <div key={p.key} className={`${p.cls} h-full first:rounded-l-full last:rounded-r-full`} style={{ width: `${(p.value / total) * 100}%` }} /> : null
        )}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <li key={p.key}>
            <Link href={`/portal/loyalty/members${p.href}`} className="block rounded-lg border border-slate-100 p-2.5 hover:border-brand-200">
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className={`h-2 w-2 rounded-full ${p.cls}`} aria-hidden="true" />
                {p.label}
              </span>
              <span className="mt-0.5 block text-lg font-bold tabular-nums text-slate-900">{num(p.value)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-400">{L.activitySubtitle(ACTIVE_DAYS)}</p>
    </div>
  );
}

const SEGMENT_LINKS: Record<SegmentKey, string | null> = {
  new: "?sort=newest",
  frequent: "?status=active&sort=visits",
  one_away: "?progress=one_away",
  reward_available: "?reward=1",
  high_ticket: "?sort=spent",
  at_risk: "?status=at_risk",
  inactive: "?status=inactive",
};

export function SegmentsList({ segments, L }: { segments: SegmentCounts; L: LoyaltyDict }) {
  const labels: Record<SegmentKey, string> = {
    new: L.segNew,
    frequent: L.segFrequent,
    one_away: L.segOneAway,
    reward_available: L.segRewardAvailable,
    high_ticket: L.segHighTicket,
    at_risk: L.segAtRisk,
    inactive: L.segInactive,
  };
  const keys: SegmentKey[] = ["new", "frequent", "one_away", "reward_available", "high_ticket", "at_risk", "inactive"];
  return (
    <ul className="divide-y divide-slate-100">
      {keys.map((k) => (
        <li key={k} className="flex items-center justify-between gap-3 py-2">
          <span className="text-sm text-slate-700">{labels[k]}</span>
          <span className="flex items-center gap-3">
            <span className="text-sm font-semibold tabular-nums text-slate-900">{num(segments.segments[k])}</span>
            {SEGMENT_LINKS[k] && (
              <Link href={`/portal/loyalty/members${SEGMENT_LINKS[k]}`} className="text-xs font-medium text-brand-600 hover:underline">
                {L.segView}
              </Link>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
