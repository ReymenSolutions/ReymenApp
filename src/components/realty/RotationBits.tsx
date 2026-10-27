import type { Speed } from "@/lib/realty/rotation";
import { cn } from "@/lib/utils";
import { Empty, SectionCard } from "./RealtyBits";

const SPEED_STYLE: Record<Speed | "LOW_DATA", string> = {
  FAST: "bg-emerald-100 text-emerald-800",
  NORMAL: "bg-blue-100 text-[#063C82]",
  SLOW: "bg-amber-100 text-amber-800",
  LOW_DATA: "bg-slate-100 text-slate-500",
};

export function SpeedBadge({ speed, label }: { speed: Speed | "LOW_DATA"; label: string }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold", SPEED_STYLE[speed])}>{label}</span>;
}

export interface SegmentLine {
  key: string;
  label: string;
  closed: number;
  open: number;
  medianDays: number | null;
  status: Speed | "LOW_DATA";
  statusLabel: string;
}

export function SegmentTable({ title, rows, heads, empty }: { title: string; rows: SegmentLine[]; heads: { segment: string; closed: string; open: string; median: string; status: string }; empty: string }) {
  return (
    <SectionCard title={title}>
      {rows.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="pb-2">{heads.segment}</th><th className="pb-2 text-right">{heads.closed}</th><th className="pb-2 text-right">{heads.open}</th><th className="pb-2 text-right">{heads.median}</th><th className="pb-2 text-right">{heads.status}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="py-2 font-medium">{r.label}</td>
                  <td className="py-2 text-right tabular-nums">{r.closed}</td>
                  <td className="py-2 text-right tabular-nums">{r.open}</td>
                  <td className="py-2 text-right tabular-nums">{r.medianDays ?? "—"}</td>
                  <td className="py-2 text-right"><SpeedBadge speed={r.status} label={r.statusLabel} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
