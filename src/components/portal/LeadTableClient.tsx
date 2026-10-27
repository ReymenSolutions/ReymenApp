"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MessageCircle, Phone, Search, X } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LeadScoreBadge } from "@/components/shared/LeadScoreBadge";
import { Badge } from "@/components/ui/badge";
import { whatsappDigits } from "@/components/portal/LeadHeaderCard";
import { Pagination } from "@/components/shared/Pagination";
import { formatDate } from "@/lib/utils";
import { LeadColumnsGear, type ColumnField } from "@/components/portal/LeadColumnsGear";
import { LeadDetailPanel } from "@/components/portal/LeadDetailPanel";
import { displayValue, type CustomFieldDef } from "@/lib/custom-fields";
import type { LeadColumnPrefs } from "@/lib/lead-columns";
import { usePreferences } from "@/context/preferences";
import type { Lead, LeadStatus } from "@prisma/client";

interface LeadTableClientProps {
  leads: Lead[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  status: LeadStatus | "ALL";
  columns: LeadColumnPrefs;
  customFields: (CustomFieldDef & ColumnField)[];
  canCreateField: boolean;
}

// Search/filter/page state all live in the URL and drive a server refetch —
// necessary so search actually covers every lead in the org, not just
// whatever page happens to be loaded client-side.
export function LeadTableClient({ leads, total, page, pageSize, query, status, columns, customFields, canCreateField }: LeadTableClientProps) {
  const { t, lang } = usePreferences();
  const es = lang !== "en";
  const C = es
    ? { stage: "Etapa:", showing: (a: number, b: number) => `Mostrando ${a} de ${b} contactos`, open: "Ver", openHint: "Haz clic en un contacto para ver su resumen.", call: "Llamar", whatsapp: "WhatsApp", actions: "Acciones" }
    : { stage: "Stage:", showing: (a: number, b: number) => `Showing ${a} of ${b} contacts`, open: "View", openHint: "Click a contact to see its summary.", call: "Call", whatsapp: "WhatsApp", actions: "Actions" };
  const show = (c: LeadColumnPrefs["hidden"][number]) => !columns.hidden.includes(c);
  const shownFields = columns.custom.map((k) => customFields.find((f) => f.key === k)).filter((f): f is (typeof customFields)[number] => !!f);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [inputValue, setInputValue] = useState(query);
  const [isFiltering, startTransition] = useTransition();
  const [panelLeadId, setPanelLeadId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Debounce the search box before pushing a URL update (and re-fetching server-side).
  useEffect(() => {
    if (inputValue === query) return;
    const timer = setTimeout(() => {
      updateParams({ q: inputValue || undefined, page: undefined });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    startTransition(() => {
      router.push(`${pathname}${params.toString() ? `?${params.toString()}` : ""}`);
    });
  }

  const statusOptions: { value: LeadStatus | "ALL"; label: string }[] = [
    { value: "ALL", label: t.filterAll },
    { value: "NEW", label: t.filterNew },
    { value: "CONTACTED", label: t.filterContacted },
    { value: "QUALIFIED", label: t.filterQualified },
    { value: "PROPOSAL", label: t.filterProposal },
    { value: "WON", label: t.filterWon },
    { value: "LOST", label: t.filterLost },
  ];

  return (
    <div>
      {/* Search + filter */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={t.searchLeads}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm text-slate-900 shadow-sm motion-micro transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
          />
          {inputValue && (
            <button
              onClick={() => setInputValue("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-slate-500">{C.stage}</span>
          {statusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => updateParams({ status: opt.value === "ALL" ? undefined : opt.value, page: undefined })}
              aria-pressed={status === opt.value}
              className={`rounded-full px-3 py-1 text-xs font-medium motion-micro transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                status === opt.value
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="sm:ml-auto">
          <LeadColumnsGear prefs={columns} fields={customFields} canCreateField={canCreateField} />
        </div>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        {C.showing(leads.length, total)} · {C.openHint}
      </p>

      {leads.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center">
          <p className="text-sm text-slate-400">{t.noLeadsFiltered}</p>
        </div>
      ) : (
        <div className={`overflow-hidden rounded-card border border-slate-200 bg-white shadow-card motion-micro transition-opacity ${isFiltering ? "opacity-60" : ""}`} aria-busy={isFiltering}>
          <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{t.colName}</th>
                {show("contact") && <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{t.colContact}</th>}
                {show("source") && <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{t.colSource}</th>}
                {show("status") && <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{t.colStatus}</th>}
                {show("score") && <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{t.colScore}</th>}
                {show("date") && <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{t.colDate}</th>}
                {shownFields.map((f) => (
                  <th key={f.key} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{f.label}</th>
                ))}
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">{C.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 [&_td]:align-middle">
              {leads.map((lead) => (
                <tr key={lead.id} className="group motion-micro transition-colors hover:bg-slate-50 focus-within:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                        {lead.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?"}
                      </span>
                      <div className="min-w-0">
                    <Link
                      href={`/portal/leads/${lead.id}`}
                      onClick={(e) => {
                        // Clic normal: panel lateral. Con Ctrl/Cmd/Shift o clic medio se conserva el enlace a la ficha completa.
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        openerRef.current = e.currentTarget;
                        setPanelLeadId(lead.id);
                      }}
                      className="block whitespace-nowrap font-medium text-slate-900 hover:text-brand-600 hover:underline"
                    >
                      {lead.name}
                    </Link>
                    {lead.notes && (
                      <p className="max-w-[180px] truncate text-xs text-slate-400">{lead.notes}</p>
                    )}
                      </div>
                    </div>
                  </td>
                  {show("contact") && (
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        {lead.email && <p className="text-xs text-slate-600">{lead.email}</p>}
                        {lead.phone && <p className="text-xs text-slate-600">{lead.phone}</p>}
                      </div>
                    </td>
                  )}
                  {show("source") && (
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{lead.source ?? "manual"}</Badge>
                    </td>
                  )}
                  {show("status") && (
                    <td className="px-4 py-3">
                      <StatusBadge status={lead.status} />
                    </td>
                  )}
                  {show("score") && (
                    <td className="px-4 py-3">
                      <LeadScoreBadge score={lead.score} reason={lead.scoreReason} showTooltip />
                    </td>
                  )}
                  {show("date") && (
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(lead.createdAt, lang)}</td>
                  )}
                  {shownFields.map((f) => (
                    <td key={f.key} className="px-4 py-3 text-xs text-slate-600">
                      {displayValue(f, (lead.customFields as Record<string, unknown> | null)?.[f.key], lang) || <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {lead.phone && (
                        <a href={`tel:${lead.phone}`} title={`${C.call} ${lead.phone}`} aria-label={`${C.call} ${lead.name}`} className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800">
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {whatsappDigits(lead.phone) && (
                        <a href={`https://wa.me/${whatsappDigits(lead.phone)}`} target="_blank" rel="noopener noreferrer" title={C.whatsapp} aria-label={`${C.whatsapp} ${lead.name}`} className="rounded-md border border-slate-200 p-1.5 text-emerald-600 hover:bg-emerald-50">
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <Link href={`/portal/leads/${lead.id}`} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
                        {C.open}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(p) => updateParams({ page: p > 1 ? String(p) : undefined })}
          />
        </div>
      )}
      <LeadDetailPanel leadId={panelLeadId} onClose={() => setPanelLeadId(null)} returnFocusRef={openerRef} />
    </div>
  );
}
