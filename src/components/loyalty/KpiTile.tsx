import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Tile de KPI con la misma anatomía que FoodKpiCard: ícono, etiqueta, valor y tendencia. */
export function KpiTile({
  icon: Icon,
  label,
  value,
  hint,
  trendPct,
  trendLabel,
  accent = "brand",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  trendPct?: number | null;
  trendLabel?: string;
  accent?: "brand" | "orange" | "emerald";
}) {
  const positive = typeof trendPct === "number" ? trendPct >= 0 : null;
  return (
    <div className="rounded-card border border-slate-200 bg-white p-4 shadow-card">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full",
          accent === "brand" && "bg-brand-50 text-brand-600",
          accent === "orange" && "bg-orange-50 text-orange-500",
          accent === "emerald" && "bg-emerald-50 text-emerald-600"
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {typeof trendPct === "number" && trendLabel ? (
        <p className={cn("mt-1 inline-flex items-center gap-1 text-xs font-semibold", positive ? "text-emerald-600" : "text-red-600")}>
          {positive ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}
          {positive ? "+" : ""}
          {trendPct}% <span className="font-normal text-slate-500">{trendLabel}</span>
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
