"use client";

import { useState, useTransition } from "react";
import { Star, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resolveCustomerFeedback } from "@/actions/feedback";
import { getErrorMessage } from "@/lib/user-error";
import { formatDateTime } from "@/lib/utils";

export type FeedbackCase = { id: string; score: number; comment: string | null; customerName: string | null; customerPhone: string | null; respondedAt: Date | null };

/** Calificaciones bajas pendientes de seguimiento: el equipo contacta al cliente y las marca como resueltas. */
export function FeedbackCases({ cases, canResolve }: { cases: FeedbackCase[]; canResolve: boolean }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const open = cases.filter((c) => !done.has(c.id));
  if (open.length === 0) return <p className="text-xs text-slate-400">No hay casos pendientes. 🎉</p>;

  function resolve(id: string) {
    start(async () => {
      try {
        await resolveCustomerFeedback(id, notes[id]);
        setDone((d) => new Set(d).add(id));
        toast.success("Seguimiento cerrado");
      } catch (e) {
        toast.error("No se pudo cerrar el caso", { description: getErrorMessage(e, "") || undefined });
      }
    });
  }

  return (
    <div className="space-y-2">
      {open.map((c) => (
        <div key={c.id} className="rounded-card border border-amber-200 bg-amber-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900">
              <span className="flex" aria-label={`${c.score} de 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={`h-3.5 w-3.5 ${n <= c.score ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                ))}
              </span>
              {c.customerName ?? "Cliente sin nombre"}
              {c.customerPhone && <span className="text-xs font-normal text-slate-500">{c.customerPhone}</span>}
            </div>
            {c.respondedAt && <span className="text-xs text-slate-400">{formatDateTime(c.respondedAt)}</span>}
          </div>
          <p className="mt-1 text-sm text-slate-700">{c.comment || <span className="text-slate-400">Sin comentario</span>}</p>
          {canResolve && (
            <div className="mt-2 flex gap-2">
              <Input className="h-8 flex-1 text-xs" placeholder="Nota del seguimiento (opcional)" value={notes[c.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))} maxLength={500} />
              <Button size="sm" disabled={pending} onClick={() => resolve(c.id)}>
                <Check className="h-3.5 w-3.5" /> Resuelto
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
