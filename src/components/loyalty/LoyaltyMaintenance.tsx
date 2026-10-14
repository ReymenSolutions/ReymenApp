"use client";
import { useState, useTransition } from "react";
import { reconcileLoyalty, retryLoyaltyEvents } from "@/actions/loyalty";
import { Button } from "@/components/ui/button";

export function LoyaltyMaintenance({ memberId, lang }: { memberId?: string; lang: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const es = lang === "es";
  return <div className="mb-4 flex flex-wrap items-center gap-3">
    <Button variant="outline" disabled={pending} onClick={() => start(async () => {
      try {
        if (memberId) { await reconcileLoyalty(memberId); setMessage(es ? "Historial conciliado." : "History reconciled."); }
        else { const r = await retryLoyaltyEvents(); setMessage(es ? `${r.count} eventos listos para reintentar.` : `${r.count} events ready to retry.`); }
      } catch { setMessage(es ? "No se pudo completar. Intenta de nuevo." : "Unable to complete. Please retry."); }
    })}>{pending ? (es ? "Procesando…" : "Processing…") : memberId ? (es ? "Conciliar historial" : "Reconcile history") : (es ? "Reintentar eventos fallidos" : "Retry failed events")}</Button>
    <span role="status" className="text-sm">{message}</span>
  </div>;
}
