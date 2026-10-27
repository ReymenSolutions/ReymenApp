"use client";

// Barra inferior de Realty en móvil: Inicio / Prospectos / Propiedades /
// Agenda / Más (el resto de las pestañas). En escritorio no se muestra.

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarDays, Home, MoreHorizontal, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { realtyStrings } from "@/lib/i18n-realty";

const BASE = "/portal/realty";

export function RealtyMobileNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const { lang } = usePreferences();
  const R = pickDict(realtyStrings, lang);
  const [open, setOpen] = useState(false);
  const main = [
    { href: BASE, label: R.tabSummary, icon: Home, exact: true },
    { href: `${BASE}/prospects`, label: R.tabProspects, icon: Users },
    { href: `${BASE}/properties`, label: R.tabProperties, icon: Building2 },
    { href: `${BASE}/visits`, label: R.tabVisits, icon: CalendarDays },
  ];
  const more = [
    { href: `${BASE}/market`, label: R.tabMarket },
    { href: `${BASE}/matches`, label: R.tabMatches },
    { href: `${BASE}/opportunities`, label: R.tabOpportunities },
    { href: `${BASE}/campaigns`, label: R.tabCampaigns },
    { href: `${BASE}/rotation`, label: R.tabRotation },
    { href: `${BASE}/reports`, label: R.tabReports },
    ...(canManage ? [{ href: `${BASE}/settings`, label: R.tabSettings }] : []),
  ];
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));
  const moreActive = more.some((m) => isActive(m.href));

  return (
    <>
      {open && <button type="button" aria-label={R.cancel} className="fixed inset-0 z-40 bg-black/20 lg:hidden" onClick={() => setOpen(false)} />}
      {open && (
        <div className="fixed inset-x-3 bottom-20 z-50 rounded-xl border border-slate-200 bg-white p-2 shadow-xl lg:hidden">
          {more.map((m) => (
            <Link key={m.href} href={m.href} onClick={() => setOpen(false)} className={cn("block rounded-lg px-3 py-2.5 text-sm font-medium", isActive(m.href) ? "bg-[#F2F4F6] text-[#031738]" : "text-slate-700")}>
              {m.label}
            </Link>
          ))}
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label={R.sectionName}>
        {main.map((m) => (
          <Link key={m.href} href={m.href} aria-current={isActive(m.href, m.exact) ? "page" : undefined} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", isActive(m.href, m.exact) ? "text-[#031738]" : "text-slate-500")}>
            <m.icon className={cn("h-5 w-5", isActive(m.href, m.exact) && "text-[#22C55E]")} aria-hidden="true" />
            <span className="max-w-full truncate px-1">{m.label}</span>
          </Link>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", moreActive || open ? "text-[#031738]" : "text-slate-500")}>
          <MoreHorizontal className={cn("h-5 w-5", moreActive && "text-[#22C55E]")} aria-hidden="true" />
          {lang === "es" ? "Más" : "More"}
        </button>
      </nav>
    </>
  );
}
