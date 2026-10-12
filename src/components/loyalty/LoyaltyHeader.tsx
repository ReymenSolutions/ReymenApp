import Link from "next/link";
import { Sparkles, ScanLine, FlaskConical } from "lucide-react";
import type { LoyaltyDict } from "@/lib/i18n-loyalty";

/** Encabezado de Lealtad con la misma línea visual que el resumen de Reymen Foods. */
export function LoyaltyHeader({
  L,
  orgName,
  programName,
  isDemo,
  showRegister,
}: {
  L: LoyaltyDict;
  orgName: string;
  programName: string | null;
  isDemo: boolean;
  showRegister: boolean;
}) {
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 px-6 py-6 text-white sm:px-8">
      <Link href="/portal/food" className="text-xs font-medium text-brand-200 hover:text-white">
        {L.backToFood}
      </Link>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300">{L.sectionName} · {orgName}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{L.moduleName}</h1>
          <p className="mt-1 text-sm text-brand-100">{L.tagline}</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          {programName && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5 text-orange-300" />
              {programName}
            </span>
          )}
          {isDemo && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-300/40" title={L.demoNote}>
              <FlaskConical className="h-3.5 w-3.5" />
              {L.demoBadge}
            </span>
          )}
          {showRegister && (
            <Link
              href="/portal/food/loyalty/visits"
              className="inline-flex items-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600"
            >
              <ScanLine className="h-4 w-4" />
              {L.registerVisitCta}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
