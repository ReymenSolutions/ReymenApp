"use client";
import { useState, useTransition } from "react";
import { reconcileLoyalty, retryLoyaltyEvents, recoverLoyaltyPosVisits } from "@/actions/loyalty";
import { Button } from "@/components/ui/button";

export function LoyaltyMaintenance({ memberId, lang, failedEvents }: { memberId?: string; lang: string; failedEvents?: number }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const es = lang === "es";
  return <div className="mb-4 flex flex-wrap items-center gap-3">
    <Button variant="outline" disabled={pending} onClick={() => start(async () => {
      try {
        if (memberId) { await reconcileLoyalty(memberId); setMessage(es ? "Historial conciliado." : "History reconciled."); }
        else { const r = await retryLoyaltyEvents(); setMessage(es ? `${r.count} ventas se volverán a procesar en unos minutos.` : `${r.count} sales will be processed again in a few minutes.`); }
      } catch { setMessage(es ? "No se pudo completar. Intenta de nuevo." : "Unable to complete. Please retry."); }
    })}>{pending ? (es ? "Procesando…" : "Processing…") : memberId ? (es ? "Conciliar historial" : "Reconcile history") : es ? `Reintentar ventas sin procesar (${failedEvents ?? 0})` : `Retry unprocessed sales (${failedEvents ?? 0})`}</Button>
    {memberId && <Button variant="outline" disabled={pending} onClick={() => start(async () => {
      try {
        const r = await recoverLoyaltyPosVisits(memberId);
        setMessage(es ? `${r.recovered} visitas recuperadas de compras omitidas por la regla anterior.${r.hasMore ? " Vuelve a pulsar para revisar más compras." : ""}` : `${r.recovered} visits recovered from purchases skipped by the previous rule.${r.hasMore ? " Run again to check more purchases." : ""}`);
      } catch { setMessage(es ? "No se pudieron recuperar las visitas. Comprueba que el programa esté activo e intenta de nuevo." : "Unable to recover visits. Check that the program is active and try again."); }
    })}>{es ? "Recuperar compras omitidas" : "Recover skipped purchases"}</Button>}
    <span role="status" className="text-sm">{message}</span>
  </div>;
}
