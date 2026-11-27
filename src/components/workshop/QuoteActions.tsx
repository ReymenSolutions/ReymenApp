"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { approveWorkshopQuote, convertWorkshopQuote, issueWorkshopQuote, markWorkshopQuoteSent } from "@/actions/workshop";
import { getErrorMessage } from "@/lib/user-error";

export function QuoteActions({ id, folio, estado, lang }: { id: string; folio: string | null; estado: string; lang: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [via, setVia] = useState("WhatsApp");
  const es = lang === "es";
  const button = "rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 disabled:opacity-50";

  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await operation();
      toast.success(success);
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, es ? "No se pudo completar" : "Could not complete"));
    } finally {
      setBusy(false);
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    {estado === "BORRADOR" && !folio && <button className={button} disabled={busy} onClick={() => run(() => issueWorkshopQuote(id), es ? "Folio emitido; ya puedes descargar el PDF" : "Reference number issued; you can now download the PDF")}>{es ? "Emitir folio" : "Issue reference number"}</button>}
    {folio && <a href={`/api/workshop/quotes/${id}/pdf?print=1`} target="_blank" rel="noopener noreferrer" className={button}>{es ? "Ver PDF" : "View PDF"}</a>}
    {estado === "BORRADOR" && folio && <button className={button} disabled={busy} onClick={() => run(() => markWorkshopQuoteSent(id), es ? "Marcada como enviada" : "Marked as sent")}>{es ? "Marcar enviada" : "Mark sent"}</button>}
    {estado === "ENVIADA" && <><select aria-label={es ? "Medio de aprobación" : "Approval method"} value={via} onChange={(event) => setVia(event.target.value)} className={button}><option>WhatsApp</option><option>{es ? "En persona" : "In person"}</option><option>{es ? "Llamada" : "Phone call"}</option></select><button className={button} disabled={busy} onClick={() => run(() => approveWorkshopQuote(id, via), es ? "Aprobación registrada" : "Approval recorded")}>{es ? "Registrar aprobación" : "Record approval"}</button></>}
    {estado === "APROBADA" && <button className="rounded-md bg-[#245A9F] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1C4A84] disabled:opacity-50" disabled={busy} onClick={() => run(() => convertWorkshopQuote(id), es ? "Orden creada" : "Order created")}>{es ? "Convertir a orden" : "Convert to order"}</button>}
  </div>;
}
