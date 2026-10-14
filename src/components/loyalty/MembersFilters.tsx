"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";
import { MAIN_BRANCH_PARAM } from "@/lib/branch-param";

const SELECT = "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700";

/** Búsqueda + filtros de la tabla de clientes; todo vive en la URL. */
export function MembersFilters({ postalCodes, branches }: { postalCodes: { postalCode: string; members: number }[]; branches: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const [q, setQ] = useState(params.get("q") ?? "");

  function set(patch: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const hasFilters = ["q", "cp", "status", "reward", "progress", "branch", "sort"].some((k) => params.get(k));

  return (
    <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
      <form
        className="relative lg:w-72"
        onSubmit={(e) => {
          e.preventDefault();
          set({ q: q.trim() });
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
        <label htmlFor="members-q" className="sr-only">{L.searchPlaceholder}</label>
        <input
          id="members-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={L.searchPlaceholder}
          className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm"
        />
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label={L.filterPostalCode} className={SELECT} value={params.get("cp") ?? ""} onChange={(e) => set({ cp: e.target.value })}>
          <option value="">{L.filterAllPostalCodes}</option>
          {postalCodes.map((p) => (
            <option key={p.postalCode} value={p.postalCode}>
              {p.postalCode} ({p.members})
            </option>
          ))}
        </select>
        <select aria-label={L.filterStatus} className={SELECT} value={params.get("status") ?? ""} onChange={(e) => set({ status: e.target.value })}>
          <option value="">{L.filterStatus}: {L.filterAllStatuses}</option>
          <option value="active">{L.statusActive}</option>
          <option value="at_risk">{L.statusAtRisk}</option>
          <option value="inactive">{L.statusInactive}</option>
        </select>
        <select aria-label={L.filterProgress} className={SELECT} value={params.get("progress") ?? ""} onChange={(e) => set({ progress: e.target.value })}>
          <option value="">{L.filterProgress}: {L.filterAllProgress}</option>
          <option value="one_away">{L.filterOneAway}</option>
          <option value="near">{L.filterNear}</option>
        </select>
        {branches.length > 0 && (
          <select aria-label={L.branch} className={SELECT} value={params.get("branch") ?? ""} onChange={(e) => set({ branch: e.target.value })}>
            <option value="">{L.allBranches}</option>
            <option value={MAIN_BRANCH_PARAM}>{L.mainBranch}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        <label className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700">
          <input type="checkbox" checked={params.get("reward") === "1"} onChange={(e) => set({ reward: e.target.checked ? "1" : "" })} className="h-4 w-4 accent-brand-600" />
          {L.filterReward}
        </label>
        <select aria-label={L.sortLabel} className={SELECT} value={params.get("sort") ?? ""} onChange={(e) => set({ sort: e.target.value })}>
          <option value="">{L.sortLabel}: {L.sortRecentVisit}</option>
          <option value="visits">{L.sortVisits}</option>
          <option value="spent">{L.sortSpent}</option>
          <option value="newest">{L.sortNewest}</option>
        </select>
        {hasFilters && (
          <button type="button" onClick={() => router.push(pathname)} className="h-9 px-2 text-sm font-medium text-brand-600 hover:underline">
            {L.clearFilters}
          </button>
        )}
      </div>
    </div>
  );
}
