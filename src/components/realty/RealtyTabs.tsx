"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { realtyStrings } from "@/lib/i18n-realty";

const BASE = "/portal/realty";

export function RealtyTabs({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const { lang } = usePreferences();
  const R = pickDict(realtyStrings, lang);
  const tabs = [
    { href: BASE, label: R.tabSummary, exact: true },
    { href: `${BASE}/prospects`, label: R.tabProspects },
    { href: `${BASE}/properties`, label: R.tabProperties },
    { href: `${BASE}/market`, label: R.tabMarket },
    { href: `${BASE}/matches`, label: R.tabMatches },
    { href: `${BASE}/visits`, label: R.tabVisits },
    { href: `${BASE}/campaigns`, label: R.tabCampaigns },
    { href: `${BASE}/opportunities`, label: R.tabOpportunities },
    { href: `${BASE}/reports`, label: R.tabReports },
    ...(canManage ? [{ href: `${BASE}/settings`, label: R.tabSettings }] : []),
  ];
  return (
    <nav className="mb-6 -mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1" aria-label={R.sectionName}>
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4",
              active ? "border-[#22C55E] text-[#031738] dark:text-white" : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
