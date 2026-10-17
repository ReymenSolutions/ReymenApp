// Piezas visuales de Realty (sin estado; sirven en servidor y cliente).
// Paleta REYMEN: navy #031738, azul #04275A, azul intenso #063C82,
// carbón #080C13, blanco roto #F2F4F6, gris claro #EDECEB, acento #22C55E.

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { BalanceStatus } from "@/lib/realty/market";
import type { RealtyPropertyStatus } from "@prisma/client";

export const RC = {
  navy: "#031738",
  blue: "#04275A",
  intense: "#063C82",
  charcoal: "#080C13",
  offWhite: "#F2F4F6",
  lightGray: "#EDECEB",
  accent: "#22C55E",
} as const;

/** Color de un score 0–100: bajo rojo, medio ámbar, alto verde (texto siempre acompaña al color). */
export function scoreColor(score: number): string {
  if (score >= 70) return "#16a34a";
  if (score >= 40) return "#d97706";
  return "#dc2626";
}

export function ScoreBar({ value, label, className, stacked }: { value: number; label?: string; className?: string; stacked?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  if (stacked)
    return (
      <div className={className}>
        <div className="mb-0.5 flex justify-between text-xs">
          <span className="text-slate-600">{label}</span>
          <span className="font-semibold tabular-nums text-slate-800">{v}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}>
          <div className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: scoreColor(v) }} />
        </div>
      </div>
    );
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {label && <span className="w-36 shrink-0 truncate text-xs text-slate-600">{label}</span>}
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-label={label}>
        <div className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: scoreColor(v) }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-800">{v}</span>
    </div>
  );
}

export function ScorePill({ value, title }: { value: number | null; title?: string }) {
  if (value === null) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span title={title} className="inline-flex min-w-[2.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums text-white" style={{ backgroundColor: scoreColor(value) }}>
      {value}
    </span>
  );
}

const BALANCE_STYLE: Record<BalanceStatus, string> = {
  HIGH_DEMAND: "bg-emerald-100 text-emerald-800 ring-emerald-600/20",
  BALANCED: "bg-blue-50 text-[#063C82] ring-[#063C82]/20",
  OVERSUPPLY: "bg-amber-50 text-amber-800 ring-amber-600/20",
  LOW_DATA: "bg-slate-100 text-slate-500 ring-slate-400/20",
};

export const BALANCE_FILL: Record<BalanceStatus, string> = {
  HIGH_DEMAND: RC.accent,
  BALANCED: RC.intense,
  OVERSUPPLY: "#d97706",
  LOW_DATA: "#94a3b8",
};

export function BalanceBadge({ status, label }: { status: BalanceStatus; label: string }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", BALANCE_STYLE[status])}>{label}</span>;
}

const STATUS_STYLE: Record<RealtyPropertyStatus, string> = {
  AVAILABLE: "bg-emerald-100 text-emerald-800",
  RESERVED: "bg-amber-100 text-amber-800",
  NEGOTIATION: "bg-blue-100 text-[#063C82]",
  SOLD: "bg-slate-800 text-white",
  RENTED: "bg-slate-800 text-white",
  INACTIVE: "bg-slate-100 text-slate-500",
};

export function StatusBadge({ status, label }: { status: RealtyPropertyStatus; label: string }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[status])}>{label}</span>;
}

/** Barras pareadas demanda/oferta con escala común (sin doble eje). */
export function PairBars({ rows, demandLabel, supplyLabel, max }: { rows: { key: string; label: React.ReactNode; demand: number; supply: number; badge?: React.ReactNode }[]; demandLabel: string; supplyLabel: string; max?: number }) {
  const top = Math.max(1, max ?? Math.max(...rows.map((r) => Math.max(r.demand, r.supply)), 1));
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: RC.intense }} />{demandLabel}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: RC.accent }} />{supplyLabel}</span>
      </div>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-medium text-slate-800">{r.label}</span>
              {r.badge}
            </div>
            <div className="space-y-1">
              <Bar value={r.demand} max={top} color={RC.intense} title={`${demandLabel}: ${r.demand}`} />
              <Bar value={r.supply} max={top} color={RC.accent} title={`${supplyLabel}: ${r.supply}`} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bar({ value, max, color, title }: { value: number; max: number; color: string; title: string }) {
  return (
    <div className="flex items-center gap-2" title={title}>
      <div className="h-2.5 flex-1 rounded-r bg-slate-50">
        <div className="h-full rounded-r" style={{ width: `${(value / max) * 100}%`, minWidth: value > 0 ? 3 : 0, backgroundColor: color }} />
      </div>
      <span className="w-7 text-right text-xs tabular-nums text-slate-600">{value}</span>
    </div>
  );
}

export function SectionCard({ title, subtitle, action, children, className }: { title: string; subtitle?: string; action?: { href: string; label: string }; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-card border border-slate-200 bg-white shadow-card", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action && (
          <Link href={action.href} className="shrink-0 text-xs font-medium text-[#063C82] hover:underline">
            {action.label}
          </Link>
        )}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}

export function Thumb({ mediaId, alt, className }: { mediaId: string | null; alt: string; className?: string }) {
  if (!mediaId) return <div className={cn("flex items-center justify-center bg-[#EDECEB] text-[10px] text-slate-400", className)} aria-hidden="true">REYMEN</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/realty/media/${mediaId}`} alt={alt} loading="lazy" className={cn("object-cover", className)} />;
}

export function Kpi({ label, value, hint, trend, trendLabel }: { label: string; value: string; hint?: string; trend?: number | null; trendLabel?: string }) {
  return (
    <div className="rounded-card border border-slate-200 bg-white p-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[#031738] dark:text-white">{value}</p>
      {typeof trend === "number" && trendLabel && (
        <p className={cn("mt-0.5 text-xs font-semibold", trend >= 0 ? "text-emerald-600" : "text-red-600")}>
          {trend >= 0 ? "▲ +" : "▼ "}
          {trend}% <span className="font-normal text-slate-500">{trendLabel}</span>
        </p>
      )}
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
