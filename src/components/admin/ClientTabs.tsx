import Link from "next/link";
import { cn } from "@/lib/utils";

export interface ClientTab {
  key: string;
  label: string;
  /** Número opcional junto al nombre (p. ej. cuántos usuarios). */
  count?: number;
}

/**
 * Pestañas de la ficha de un cliente. Cada una es una URL (?tab=...): se puede compartir o recargar, y el servidor solo
 * carga los datos de la pestaña abierta en lugar de armar una página interminable.
 */
export function ClientTabs({ basePath, tabs, active, label }: { basePath: string; tabs: ClientTab[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="mb-6 flex min-w-0 gap-1 overflow-x-auto border-b border-slate-200">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.key === tabs[0].key ? basePath : `${basePath}?tab=${tab.key}`}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors sm:px-4",
              isActive ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn("rounded-full px-1.5 text-xs", isActive ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500")}>{tab.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
