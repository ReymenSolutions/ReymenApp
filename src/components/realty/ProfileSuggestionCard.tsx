"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { acceptRealtyProfileSuggestion, rejectRealtyProfileSuggestion } from "@/actions/realty";
import { getErrorMessage } from "@/lib/user-error";
import { pickDict } from "@/lib/i18n-dict";
import { realtyStrings } from "@/lib/i18n-realty";
import type { LeadSuggestionView } from "@/lib/realty/lead-profile";

/** Propuesta de perfil de búsqueda que dedujo el Agente IA de la conversación: se acepta, se edita o se descarta. */
export function ProfileSuggestionCard({ s, leadId, lang, compact }: { s: LeadSuggestionView; leadId: string; lang: "es" | "en"; compact?: boolean }) {
  const R = pickDict(realtyStrings, lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  if (gone) return null;

  function run(fn: () => Promise<unknown>, ok: string) {
    start(async () => {
      try {
        await fn();
        toast.success(ok);
        setGone(true);
        router.refresh();
      } catch (err) {
        toast.error(getErrorMessage(err, "Error"));
      }
    });
  }

  const chips = [s.operation, s.type, s.bedrooms ? R.sugBedrooms.replace("{n}", String(s.bedrooms)) : null, ...s.extras].filter(Boolean) as string[];
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-2.5 text-sm dark:border-violet-400/30 dark:bg-violet-500/10">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-violet-800 dark:text-violet-200">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        {R.sugTitle}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <span key={c} className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-violet-200">{c}</span>
        ))}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-slate-500">{R.leadSearchBudget}</dt>
        <dd className="font-medium text-slate-900">{s.budget}</dd>
        <dt className="text-slate-500">{R.leadSearchZones}</dt>
        <dd className="font-medium text-slate-900">{s.zones.length ? s.zones.join(", ") : <span className="font-normal text-slate-400">{R.leadSearchNoZones}</span>}</dd>
      </dl>
      {s.reason && !compact && <p className="mt-2 text-xs italic text-slate-600">“{s.reason}”</p>}
      <p className="mt-2 text-[11px] text-slate-500">{R.sugHint}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(() => acceptRealtyProfileSuggestion(s.id), R.sugAccepted)} className="rounded-md bg-violet-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-60">{R.sugAccept}</button>
        <Link href={`/portal/realty/prospects/new?leadId=${encodeURIComponent(leadId)}&suggestion=${encodeURIComponent(s.id)}`} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">{R.sugEdit}</Link>
        <button type="button" disabled={pending} onClick={() => run(() => rejectRealtyProfileSuggestion(s.id), R.sugRejected)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 disabled:opacity-60">{R.sugReject}</button>
      </div>
    </div>
  );
}
