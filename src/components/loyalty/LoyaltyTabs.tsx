"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";

const BASE = "/portal/loyalty";

/** Pestañas de Lealtad. Igual que PortalSectionTabs, pero activa también en sub-rutas (perfil de un cliente). */
export function LoyaltyTabs() {
  const pathname = usePathname();
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const tabs = [
    { href: BASE, label: L.tabSummary, exact: true },
    { href: `${BASE}/program`, label: L.tabProgram },
    { href: `${BASE}/members`, label: L.tabMembers },
    { href: `${BASE}/visits`, label: L.tabVisits },
    { href: `${BASE}/map`, label: L.tabMap },
    { href: `${BASE}/analytics`, label: L.tabAnalytics },
  ];
  return (
    <nav className="mb-6 -mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1" aria-label={L.sectionName}>
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4",
              active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
