"use client";

import { Check, Copy, Download, ExternalLink } from "lucide-react";
import { useCopyToClipboard } from "@/components/shared/CopyButton";
import { usePreferences } from "@/context/preferences";
import { pickDict } from "@/lib/i18n-dict";
import { loyaltyStrings } from "@/lib/i18n-loyalty";

export interface PublicLink {
  key: string;
  label: string;
  url: string;
  qrDataUrl: string;
  fileName: string;
}

function LinkRow({ link, big }: { link: PublicLink; big?: boolean }) {
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className={big ? "flex flex-col gap-4 sm:flex-row sm:items-center" : "flex items-center gap-3"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={link.qrDataUrl} alt="QR" width={big ? 132 : 56} height={big ? 132 : 56} className="shrink-0 rounded-lg border border-slate-100 bg-white" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{link.label}</p>
        <p className="truncate font-mono text-xs text-slate-500">{link.url}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => copy(link.url)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? L.copied : L.copy}
          </button>
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {L.openLink}
          </a>
          <a href={link.qrDataUrl} download={link.fileName} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {L.downloadQr}
          </a>
        </div>
      </div>
    </div>
  );
}

export function PublicLinks({ main, branches }: { main: PublicLink; branches: PublicLink[] }) {
  const { lang } = usePreferences();
  const L = pickDict(loyaltyStrings, lang);
  return (
    <div className="space-y-5">
      <LinkRow link={main} big />
      {branches.length > 0 && (
        <div className="border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold text-slate-900">{L.branchLinks}</p>
          <p className="mb-3 text-xs text-slate-500">{L.branchLinksHint}</p>
          <div className="space-y-3">
            {branches.map((b) => (
              <LinkRow key={b.key} link={b} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
