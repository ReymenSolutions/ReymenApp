"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function WorkshopQuoteSections({ lang, view, pending }: { lang: string; view: "pending" | "mine"; pending: number }) {
  const router = useRouter();
  const es = lang === "es";
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <nav aria-label={es ? "Apartados de cotizaciones" : "Quote sections"} className="grid grid-cols-2 gap-2">
    <Link href="/portal/workshop?tab=quotes&view=pending" aria-current={view === "pending" ? "page" : undefined} className={`flex min-w-0 items-center justify-center gap-2 rounded-lg border px-2 py-3 text-center text-xs font-semibold sm:text-sm ${view === "pending" ? "border-red-700 bg-red-50 text-red-900 dark:bg-slate-800 dark:text-white" : "border-slate-300 bg-white text-slate-800 dark:bg-slate-900 dark:text-white"}`}>
      <span>{es ? "Por atender" : "To review"}</span>{pending > 0 && <span aria-label={es ? `${pending} por atender` : `${pending} pending`} className="min-w-6 rounded-full bg-[#B4232D] px-1.5 py-0.5 text-center text-xs text-white">{pending}</span>}
    </Link>
    <Link href="/portal/workshop?tab=quotes&view=mine" aria-current={view === "mine" ? "page" : undefined} className={`rounded-lg border px-2 py-3 text-center text-xs font-semibold sm:text-sm ${view === "mine" ? "border-red-700 bg-red-50 text-red-900 dark:bg-slate-800 dark:text-white" : "border-slate-300 bg-white text-slate-800 dark:bg-slate-900 dark:text-white"}`}>{es ? "Mis cotizaciones" : "My quotes"}</Link>
  </nav>;
}
