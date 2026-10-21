import Link from "next/link";
import { Building2, FlaskConical, Plus, UserPlus } from "lucide-react";
import type { RealtyDict } from "@/lib/i18n-realty";

/** Encabezado de Realty con la paleta REYMEN (navy → azul intenso). */
export function RealtyHeader({ R, orgName, isDemo, canOperate }: { R: RealtyDict; orgName: string; isDemo: boolean; canOperate: boolean }) {
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-[#04275A] bg-gradient-to-br from-[#031738] via-[#04275A] to-[#063C82] px-5 py-6 text-white sm:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#22C55E]">
            <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            {R.sectionName} · {orgName}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-4xl">{R.moduleName}</h1>
          <p className="mt-1 text-sm text-[#F2F4F6]/80">{R.tagline}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {isDemo && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-100 ring-1 ring-amber-300/40">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              {R.demoBadge}
            </span>
          )}
          {canOperate && (
            <>
              <Link href="/portal/realty/prospects/new" className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/20">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                {R.newProspect}
              </Link>
              <Link href="/portal/realty/properties/new" className="inline-flex items-center gap-1.5 rounded-md bg-[#22C55E] px-3 py-2 text-sm font-semibold text-[#080C13] shadow-sm hover:bg-[#16a34a]">
                <Plus className="h-4 w-4" aria-hidden="true" />
                {R.newProperty}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
