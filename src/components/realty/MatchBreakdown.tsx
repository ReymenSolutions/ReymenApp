import type { RealtyDict } from "@/lib/i18n-realty";
import { MATCH_WEIGHTS } from "@/lib/realty/match";
import { ScoreBar } from "./RealtyBits";

/** Desglose de un match: cada componente 0–100 con su peso. */
export function MatchBreakdown({ R, m }: { R: RealtyDict; m: { budgetScore: number; zoneScore: number; typeScore: number; roomsScore: number; areaScore: number; extrasScore: number } }) {
  const rows = [
    [R.matchBudget, m.budgetScore, MATCH_WEIGHTS.budget],
    [R.matchZone, m.zoneScore, MATCH_WEIGHTS.zone],
    [R.matchType, m.typeScore, MATCH_WEIGHTS.type],
    [R.matchRooms, m.roomsScore, MATCH_WEIGHTS.rooms],
    [R.matchArea, m.areaScore, MATCH_WEIGHTS.area],
    [R.matchExtras, m.extrasScore, MATCH_WEIGHTS.extras],
  ] as const;
  return (
    <div className="space-y-1.5">
      {rows.map(([label, v, w]) => (
        <ScoreBar key={label} label={`${label} · ${w}%`} value={v} />
      ))}
    </div>
  );
}
