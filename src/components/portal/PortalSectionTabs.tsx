"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface PortalTab {
  href: string;
  label: string;
  matchChildren?: boolean;
}

// Same visual language as the AI Lab's own internal tab bar
// (AiLabWorkspace.tsx) — reused here for grouping sibling pages of a
// module family (e.g. WhatsApp AI, Automatizaciones) under one sidebar
// entry instead of listing each page as its own nav item.
export function PortalSectionTabs({ tabs, wrap = false, label = "Sections" }: { tabs: PortalTab[]; wrap?: boolean; label?: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className={cn("mb-6 flex min-w-0 gap-1 border-b border-slate-200", wrap ? "flex-wrap" : "-mx-1 overflow-x-auto px-1")}>
      {tabs.map((tab) => {
        const active = pathname === tab.href || !!(tab.matchChildren && pathname.startsWith(`${tab.href}/`));
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4",
              active
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
