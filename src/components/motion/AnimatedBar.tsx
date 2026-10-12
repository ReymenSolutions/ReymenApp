"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Barra de progreso: crece desde cero la primera vez que aparece y después se ajusta con suavidad cuando
 * cambia el valor. Usa transform (no el ancho), así no recalcula el layout.
 */
export function AnimatedBar({ value, className, trackClassName, label }: { value: number; className?: string; trackClassName?: string; label?: string }) {
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const pct = Math.max(0, Math.min(100, value));
  const scale = reduced || armed ? pct / 100 : 0;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", trackClassName)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div
        className={cn("h-full w-full origin-left rounded-full bg-brand-500 transition-transform duration-[600ms] ease-out", className)}
        style={{ transform: `scaleX(${scale})`, transitionDuration: reduced ? "0ms" : undefined }}
      />
    </div>
  );
}
