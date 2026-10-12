"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { submitCustomerFeedback } from "@/actions/feedback";
import { getErrorMessage } from "@/lib/user-error";
import type { PublicFeedbackView } from "@/lib/feedback";

const LABELS = ["Muy mala", "Mala", "Regular", "Buena", "Excelente"];

export function FeedbackForm({ token, view }: { token: string; view: PublicFeedbackView }) {
  const [score, setScore] = useState<number>(view.score ?? 0);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(view.state === "answered");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = view.customerName?.split(" ")[0];

  function send() {
    if (!score || pending) return;
    setError(null);
    start(async () => {
      try {
        await submitCustomerFeedback(token, score, comment);
        setDone(true);
      } catch (e) {
        setError(getErrorMessage(e, "No pudimos guardar tu opinión. Inténtalo de nuevo."));
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-card border border-slate-200 bg-white p-6 text-center shadow-card">
        <h1 className="text-xl font-semibold text-slate-900">¡Gracias{first ? `, ${first}` : ""}!</h1>
        <p className="mt-2 text-sm text-slate-600">Tu opinión nos ayuda a mejorar en {view.businessName}.</p>
        {view.reviewUrl && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-sm text-slate-600">¿Nos ayudas contándolo a otras personas? Solo toma un minuto.</p>
            <a href={view.reviewUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-[rgb(255_255_255)] hover:bg-brand-700">
              Dejar una reseña
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-slate-200 bg-white p-6 shadow-card">
      <h1 className="text-xl font-semibold text-slate-900">{first ? `${first}, ¿cómo` : "¿Cómo"} te fue en {view.businessName}?</h1>
      <p className="mt-1 text-sm text-slate-600">Tu opinión toma menos de un minuto.</p>

      <div role="radiogroup" aria-label="Calificación" className="mt-5 flex justify-between">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} de 5: ${LABELS[n - 1]}`}
            onClick={() => setScore(n)}
            className="rounded-md p-1.5 motion-micro transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 hover:scale-110"
          >
            <Star className={`h-9 w-9 ${n <= score ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
          </button>
        ))}
      </div>
      <p className="mt-1 h-5 text-center text-sm font-medium text-slate-700">{score ? LABELS[score - 1] : ""}</p>

      <Textarea className="mt-4" rows={3} maxLength={1000} placeholder="¿Quieres contarnos algo más? (opcional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      <Button className="mt-4 w-full" onClick={send} disabled={!score} loading={pending}>
        Enviar opinión
      </Button>
    </div>
  );
}
