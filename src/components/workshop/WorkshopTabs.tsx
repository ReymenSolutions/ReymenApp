"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Tab = { id: string; es: string; en: string };

export function WorkshopTabs({ tabs, selected, lang, pending }: { tabs: Tab[]; selected: string; lang: string; pending: number }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const es = lang === "es";
  const primary = tabs.slice(0, 4);
  const more = tabs.slice(4);
  const activeMore = more.find((tab) => tab.id === selected);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const style = (active: boolean) => `whitespace-nowrap border-b-2 px-1 py-2 text-[11px] text-white sm:px-4 sm:text-sm ${active ? "border-[#C93B44] font-bold" : "border-transparent font-medium hover:text-white"}`;
  return <nav aria-label={es ? "Secciones del taller" : "Workshop sections"} className="relative mb-5 flex w-full items-end justify-between gap-0 border-b border-slate-500 bg-[#111C33]">
    {primary.map((tab) => <Link key={tab.id} href={`/portal/workshop?tab=${tab.id}`} aria-current={selected === tab.id ? "page" : undefined} className={style(selected === tab.id)}>{es ? tab.es : tab.en}{tab.id === "quotes" && pending > 0 && <span className="ml-1 rounded-full bg-[#B4232D] px-1.5 py-0.5 text-[10px] text-white">{pending}</span>}</Link>)}
    {more.length > 0 && <div ref={menuRef} className="relative"><button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} className={`${style(!!activeMore)} flex items-center gap-0.5`}>{es ? "Más" : "More"}<ChevronDown className="h-3.5 w-3.5 shrink-0" /></button>
      {open && <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-lg border border-slate-600 bg-[#111C33] p-1 shadow-xl">{more.map((tab) => <Link key={tab.id} href={`/portal/workshop?tab=${tab.id}`} role="menuitem" aria-current={selected === tab.id ? "page" : undefined} onClick={() => setOpen(false)} className={`block rounded px-3 py-2 text-sm text-white ${selected === tab.id ? "bg-[#233B64] font-bold" : "hover:bg-[#233B64]"}`}>{es ? tab.es : tab.en}</Link>)}</div>}
    </div>}
  </nav>;
}
