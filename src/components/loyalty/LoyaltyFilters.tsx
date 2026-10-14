"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";
import { MAIN_BRANCH_PARAM } from "@/lib/branch-param";
import type { PeriodKey } from "@/lib/loyalty/period";

/**
 * Filtros de una sola fila: periodo (chips + rango) y sucursal. Viven en la
 * URL (?p=&from=&to=&branch=) para que se puedan compartir y sobrevivan al
 * recargar; cambiar uno conserva los demás.
 */
export function LoyaltyFilters({
  period,
  fromDay,
  toDay,
  branches,
  branch,
  showPeriod = true,
}: {
  period: PeriodKey;
  fromDay: string;
  toDay: string;
  branches: { id: string; name: string }[];
  /** "all" | "main" | id */
  branch: string;
  showPeriod?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const [from, setFrom] = useState(fromDay);
  const [to, setTo] = useState(toDay);

  function go(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const periods: { key: PeriodKey; label: string }[] = [
    { key: "today", label: L.periodToday },
    { key: "7d", label: L.period7d },
    { key: "30d", label: L.period30d },
    { key: "month", label: L.periodMonth },
    { key: "custom", label: L.periodCustom },
  ];

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {showPeriod && (
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Periodo">
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => (p.key === "custom" ? go({ p: "custom", from, to }) : go({ p: p.key, from: null, to: null }))}
              aria-pressed={period === p.key}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                period === p.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
      {showPeriod && period === "custom" && (
        <form
          className="flex flex-wrap items-center gap-1.5 text-xs"
          onSubmit={(e) => {
            e.preventDefault();
            go({ p: "custom", from, to });
          }}
        >
          <label className="sr-only" htmlFor="loyalty-from">{L.from}</label>
          <input id="loyalty-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs" />
          <span className="text-slate-400">–</span>
          <label className="sr-only" htmlFor="loyalty-to">{L.to}</label>
          <input id="loyalty-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs" />
          <button type="submit" className="h-8 rounded-md bg-brand-600 px-3 font-medium text-white hover:bg-brand-700">{L.apply}</button>
        </form>
      )}
      {branches.length > 0 && (
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="loyalty-branch" className="text-xs font-medium text-slate-500">{L.branch}</label>
          <select
            id="loyalty-branch"
            value={branch}
            onChange={(e) => go({ branch: e.target.value === "all" ? null : e.target.value })}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"
          >
            <option value="all">{L.allBranches}</option>
            <option value={MAIN_BRANCH_PARAM}>{L.mainBranch}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
