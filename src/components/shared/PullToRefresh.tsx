"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * "Desliza hacia abajo para actualizar" en celular. El contenido se desplaza
 * dentro de <main> (no la ventana), así que el gesto nativo del navegador no
 * aplica: aquí, estando hasta arriba, al jalar aparece el indicador con los
 * colores de Reymen y al soltar pasado el umbral se vuelven a pedir los datos
 * de la página (router.refresh, sin perder lo que se está escribiendo).
 */

const THRESHOLD = 72; // px jalados para actualizar
const MAX_PULL = 120;
const HOLD = 56; // dónde se queda el indicador mientras actualiza

/** Resistencia tipo goma: cada vez cuesta más jalar. */
function resist(dy: number): number {
  return MAX_PULL * (1 - Math.exp(-dy / (MAX_PULL * 1.6)));
}

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);

  const setPullBoth = (v: number) => {
    pullRef.current = v;
    setPull(v);
  };

  const refresh = useCallback(() => {
    refreshingRef.current = true;
    setRefreshing(true);
    pullRef.current = HOLD;
    setPull(HOLD);
    startTransition(() => router.refresh());
  }, [router]);

  // Mantiene el contenido visible y termina con la transición real, sin demoras artificiales.
  useEffect(() => {
    if (!refreshing || isPending) return;
    refreshingRef.current = false;
    setRefreshing(false);
    pullRef.current = 0;
    setPull(0);
  }, [refreshing, isPending]);
  useEffect(() => {
    refreshingRef.current = false; pullRef.current = 0;
    setRefreshing(false); setDragging(false); setPull(0);
  }, [pathname]);

  useEffect(() => {
    const root = rootRef.current;
    const scroller = root?.closest("main");
    if (!root || !scroller) return;
    let startY: number | null = null;
    let startX = 0;

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1 || e.touches[0].clientX <= 28 || (e.target as Element)?.closest?.("input,textarea,select,button,[contenteditable=true]") || scroller.scrollTop > 0) {
        startY = null;
        return;
      }
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - startY;
      const dx = Math.abs(e.touches[0].clientX - startX);
      // Hacia arriba, de lado (carruseles, pestañas) o ya con scroll: no es un "jalar".
      if (dy <= 0 || dx > dy || scroller.scrollTop > 0) {
        if (pullRef.current !== 0) setPullBoth(0);
        setDragging(false);
        if (dy <= 0 || dx > dy) startY = null;
        return;
      }
      if (e.cancelable) e.preventDefault();
      setDragging(true);
      setPullBoth(resist(dy));
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      setDragging(false);
      if (pullRef.current >= THRESHOLD) refresh();
      else setPullBoth(0);
    };

    const onCancel = () => { startY = null; setDragging(false); setPullBoth(0); };
    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: false });
    scroller.addEventListener("touchend", onEnd);
    scroller.addEventListener("touchcancel", onCancel);
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
      scroller.removeEventListener("touchcancel", onCancel);
    };
  }, [refresh, pathname]);

  const progress = Math.min(1, pull / THRESHOLD);
  const ready = progress >= 1;
  const easing = dragging ? "none" : "transform 380ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease";
  const R = 9;
  const C = 2 * Math.PI * R;

  return (
    <div ref={rootRef} className="relative motion-reduce:[&_*]:!transition-none">
      <div
        aria-hidden={!refreshing}
        role={refreshing ? "status" : undefined}
        aria-label={refreshing ? "Actualizando" : undefined}
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
        style={{ transform: `translateY(${pull - 48}px)`, opacity: pull > 4 ? Math.max(0.35, progress) : 0, transition: easing }}
      >
        <div
          className={`ptr-badge flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white shadow-lg ${ready ? "ptr-ready" : ""}`}
          style={{ transform: `scale(${0.6 + 0.4 * progress})`, transition: dragging ? "none" : "transform 260ms ease" }}
        >
          <svg viewBox="0 0 24 24" className={`ptr-icon h-6 w-6 ${refreshing ? "ptr-spin" : ""}`} style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }}>
            <circle cx="12" cy="12" r={R} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2.5" />
            <circle
              cx="12"
              cy="12"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={refreshing ? C * 0.7 : C * (1 - 0.8 * progress)}
              transform="rotate(-90 12 12)"
            />
          </svg>
        </div>
      </div>
      <div style={pull > 0 ? { transform: `translateY(${pull}px)`, transition: easing } : { transition: easing }}>{children}</div>
    </div>
  );
}
