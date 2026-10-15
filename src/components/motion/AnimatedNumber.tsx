"use client";

import { useEffect, useRef, useState } from "react";
import { easeOutCubic, MOTION } from "@/lib/motion";
import { formatNumber, type NumberFormat } from "@/lib/format-number";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Cifra que se anima: conserva el valor inicial y, cuando cambia el dato (por ejemplo al filtrar),
 * interpola desde el valor anterior. Con movimiento reducido solo muestra el valor final. El lector de
 * pantalla recibe siempre el valor final, nunca los números intermedios.
 */
export function AnimatedNumber({ value, format, className, duration = MOTION.count }: { value: number; format?: NumberFormat; className?: string; duration?: number }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (reduced) {
      fromRef.current = value;
      // Keep the stored display current if the user later enables motion again.
      const frame = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frame);
    }
    const from = fromRef.current;
    if (from === value) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const v = from + (value - from) * easeOutCubic(p);
      fromRef.current = v;
      setDisplay(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced, duration]);

  const shown = reduced ? value : display;
  return (
    <span className={className}>
      <span aria-hidden="true">{formatNumber(shown, format)}</span>
      <span className="sr-only">{formatNumber(value, format)}</span>
    </span>
  );
}
