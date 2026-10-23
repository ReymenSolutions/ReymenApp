"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface TabBarItem {
  key: string;
  label: string;
  count?: number;
}

/**
 * Barra de pestañas accesible para secciones de una sola pantalla (el contenido se alterna en el cliente): rol
 * tablist/tab, flechas ←/→, Inicio/Fin y foco que sigue a la pestaña. Cada pestaña apunta a `${idBase}-panel-${key}`;
 * el panel debe llevar role="tabpanel" con ese id y aria-labelledby=`${idBase}-tab-${key}`.
 */
export function TabBar({ tabs, value, onChange, label, idBase }: { tabs: TabBarItem[]; value: string; onChange: (key: string) => void; label: string; idBase: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  function move(to: number) {
    const tab = tabs[(to + tabs.length) % tabs.length];
    onChange(tab.key);
    refs.current[tab.key]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className="mb-4 flex min-w-0 gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((tab, i) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            ref={(el) => { refs.current[tab.key] = el; }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tab.key}`}
            aria-selected={active}
            aria-controls={`${idBase}-panel-${tab.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); move(i + 1); }
              else if (e.key === "ArrowLeft") { e.preventDefault(); move(i - 1); }
              else if (e.key === "Home") { e.preventDefault(); move(0); }
              else if (e.key === "End") { e.preventDefault(); move(tabs.length - 1); }
            }}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4",
              active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500")}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
