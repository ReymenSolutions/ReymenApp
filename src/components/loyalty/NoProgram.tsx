import Link from "next/link";
import { Gift } from "lucide-react";
import type { LoyaltyDict } from "@/lib/i18n-loyalty";

export function NoProgram({ L, canManage }: { L: LoyaltyDict; canManage: boolean }) {
  return (
    <div className="rounded-card border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-50">
        <Gift className="h-6 w-6 text-orange-500" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-slate-900">{L.noProgramTitle}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{canManage ? L.noProgramDesc : L.noProgramViewer}</p>
      {canManage && (
        <Link href="/portal/loyalty/program" className="mt-5 inline-flex items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          {L.noProgramCta}
        </Link>
      )}
    </div>
  );
}
