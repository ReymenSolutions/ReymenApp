"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function WorkshopQuoteSections({ lang, view, unread, canCreate }: { lang: string; view: "new" | "received"; unread: number; canCreate: boolean }) {
  const router = useRouter();
  const es = lang === "es";
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <nav aria-label={es ? "Apartados de cotizaciones" : "Quote sections"} className="grid gap-2 sm:grid-cols-2">
    {canCreate && <Link href="/portal/workshop?tab=quotes&view=new" aria-current={view === "new" ? "page" : undefined} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${view === "new" ? "border-red-700 bg-red-50 text-red-900" : "border-slate-200 bg-white text-slate-700"}`}>{es ? "Nueva cotización" : "New quote"}</Link>}
    <Link href="/portal/workshop?tab=quotes&view=received" aria-current={view === "received" ? "page" : undefined} className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-semibold ${view === "received" ? "border-red-700 bg-red-50 text-red-900" : "border-slate-200 bg-white text-slate-700"}`}>
      <span>{es ? "Solicitudes recibidas" : "Received requests"}</span>{unread > 0 && <span aria-label={es ? `${unread} sin revisar` : `${unread} unread`} className="min-w-6 rounded-full bg-red-700 px-2 py-0.5 text-center text-xs text-white">{unread}</span>}
    </Link>
  </nav>;
}
