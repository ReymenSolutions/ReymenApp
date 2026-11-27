"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setWorkshopQuoteIva } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

export function WorkshopQuoteIvaToggle({ quoteId, checked, lang }: { quoteId: string; checked: boolean; lang: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const es = lang === "es";
  async function change(next: boolean) {
    setBusy(true);
    try {
      await setWorkshopQuoteIva(quoteId, next);
      router.refresh();
      toast.success(es ? "IVA actualizado" : "VAT updated");
    } catch (error) {
      toast.error(getErrorMessage(error, es ? "No se pudo actualizar el IVA" : "Could not update VAT"));
    } finally { setBusy(false); }
  }
  return <div><label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800"><input type="checkbox" checked={checked} disabled={busy} onChange={(event) => void change(event.target.checked)} className="h-4 w-4 accent-[#245A9F]" />{es ? "Incluye IVA (16%)" : "Includes VAT (16%)"}</label>{!checked && <p className="mt-1 text-xs text-amber-800">{es ? "Si el cliente pidió factura, revisa esta elección." : "If the customer requested an invoice, review this choice."}</p>}</div>;
}
