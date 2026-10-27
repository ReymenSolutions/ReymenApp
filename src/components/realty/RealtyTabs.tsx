"use client";

// Pestañas de Real Estate, como en los demás módulos. En escritorio: las 5 de
// todos los días a la vista y el resto en "Más". En celular: todas en una sola
// fila con desplazamiento horizontal (la pestaña activa se centra sola).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { realtyStrings } from "@/lib/i18n-realty";

const BASE = "/portal/realty";

export function RealtyTabs({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const { lang } = usePreferences();
  const R = pickDict(realtyStrings, lang);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const main = [
    { href: BASE, label: R.tabSummary, exact: true },
    { href: `${BASE}/prospects`, label: R.tabProspects },
    { href: `${BASE}/properties`, label: R.tabProperties },
    { href: `${BASE}/market`, label: R.tabMarket },
    { href: `${BASE}/visits`, label: R.tabVisits },
  ];
  const more = [
    { href: `${BASE}/matches`, label: R.tabMatches },
    { href: `${BASE}/opportunities`, label: R.tabOpportunities },
    { href: `${BASE}/campaigns`, label: R.tabCampaigns },
    { href: `${BASE}/rotation`, label: R.tabRotation },
    { href: `${BASE}/reports`, label: R.tabReports },
    ...(canManage ? [{ href: `${BASE}/settings`, label: R.tabSettings }] : []),
  ];
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));
  const all: { href: string; label: string; exact?: boolean }[] = [...main, ...more];
  const activeMore = more.find((m) => isActive(m.href));
  const stripRef = useRef<HTMLElement>(null);

  // Se cierra al cambiar de página, al dar clic fuera o con Escape.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // En celular la pestaña activa queda a la vista dentro de la fila desplazable.
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  const tabClass = (active: boolean) =>
    cn(
      "flex-shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors xl:px-4",
      active ? "border-[#22C55E] text-[#031738] dark:text-white" : "border-transparent text-slate-500 hover:text-slate-700",
    );

  return (
    <>
    <nav ref={stripRef} aria-label={R.sectionName} className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 px-1 lg:hidden">
      {all.map((tab) => {
        const active = isActive(tab.href, tab.exact);
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
    <nav className="mb-6 hidden items-end gap-1 border-b border-slate-200 lg:flex" aria-label={R.sectionName}>
      {main.map((tab) => {
        const active = isActive(tab.href, tab.exact);
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
            {tab.label}
          </Link>
        );
      })}
      <div ref={menuRef} className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className={cn(tabClass(!!activeMore), "inline-flex items-center gap-1")}>
          {activeMore ? activeMore.label : lang === "es" ? "Más" : "More"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        {open && (
          <div role="menu" className="absolute left-0 top-full z-30 mt-1 min-w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {more.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                role="menuitem"
                aria-current={isActive(m.href) ? "page" : undefined}
                className={cn("block rounded-md px-3 py-2 text-sm font-medium", isActive(m.href) ? "bg-[#F2F4F6] text-[#031738]" : "text-slate-700 hover:bg-slate-50")}
              >
                {m.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
    </>
  );
}
