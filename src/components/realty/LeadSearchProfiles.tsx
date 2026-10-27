import Link from "next/link";
import { Home, Plus } from "lucide-react";
import { pickDict } from "@/lib/i18n-dict";
import { realtyStrings } from "@/lib/i18n-realty";
import type { LeadSearchView, LeadSuggestionView } from "@/lib/realty/lead-profile";
import { ProfileSuggestionCard } from "./ProfileSuggestionCard";

/**
 * «Lo que busca» en la ficha de un contacto del CRM: compra/renta, tipo, presupuesto y colonias de su perfil de Real Estate
 * (o un botón para agregarlo). Solo presenta datos ya formateados: sirve igual en la ficha (servidor) y en el panel lateral.
 */
export function LeadSearchProfiles({ views, suggestions = [], leadId, canOperate, lang, compact = false, hideTitle = false }: { views: LeadSearchView[]; suggestions?: LeadSuggestionView[]; leadId: string; canOperate: boolean; lang: "es" | "en"; compact?: boolean; hideTitle?: boolean }) {
  const R = pickDict(realtyStrings, lang);
  const addHref = `/portal/realty/prospects/new?leadId=${encodeURIComponent(leadId)}`;
  return (
    <section aria-label={R.leadSearchTitle} className="space-y-2">
      <h3 className={`${hideTitle ? "sr-only " : ""}flex items-center gap-1.5 font-semibold text-slate-900 ${compact ? "text-xs uppercase tracking-wide text-slate-500" : "text-sm"}`}>
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
        {R.leadSearchTitle}
      </h3>
      {canOperate && suggestions.map((sg) => <ProfileSuggestionCard key={sg.id} s={sg} leadId={leadId} lang={lang} compact={compact} />)}
      {views.length === 0 ? (
        <div className="space-y-2">
          {!(canOperate && suggestions.length > 0) && <p className="text-xs text-slate-500">{R.leadSearchNone}</p>}
          {canOperate && (
            <Link href={addHref} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              {R.leadSearchAdd}
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {views.map((v) => (
            <li key={v.id} className={`rounded-lg border border-slate-100 p-2.5 text-sm ${v.active ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{v.operation}</span>
                {v.type && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{v.type}</span>}
                {!v.active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{R.leadSearchInactive}</span>}
                {v.bestMatch !== null && <span className="ml-auto text-xs text-slate-500">{R.leadSearchMatch}: <strong className="text-slate-900">{v.bestMatch}</strong></span>}
              </div>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-500">{R.leadSearchBudget}</dt>
                <dd className="font-medium text-slate-900">{v.budget}</dd>
                <dt className="text-slate-500">{R.leadSearchZones}</dt>
                <dd className="font-medium text-slate-900">{v.zones.length ? v.zones.join(", ") : <span className="font-normal text-slate-400">{R.leadSearchNoZones}</span>}</dd>
                {v.sourceProperty && (
                  <>
                    <dt className="text-slate-500">{R.leadSearchFrom}</dt>
                    <dd className="truncate font-medium text-slate-900">
                      <Link href={`/portal/realty/properties/${v.sourceProperty.id}`} className="text-brand-600 hover:underline">{v.sourceProperty.title}</Link>
                    </dd>
                  </>
                )}
              </dl>
              <Link href={`/portal/realty/prospects/${v.id}`} className="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline">
                {R.leadSearchOpen} →
              </Link>
            </li>
          ))}
        </ul>
      )}
      {views.length > 0 && canOperate && (
        <Link href={addHref} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          <Plus className="h-3 w-3" aria-hidden="true" />
          {R.leadSearchAdd}
        </Link>
      )}
    </section>
  );
}
