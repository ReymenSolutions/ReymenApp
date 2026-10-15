"use client";

import { useCallback, useEffect, useRef } from "react";

// El borde izquierdo pertenece al historial nativo (Safari/iOS).
// El menú se abre con su botón; solo conservamos el gesto de cerrar.
const CLOSE_DISTANCE = 56;
const MOBILE_QUERY = "(max-width: 1023px)";

export function useDrawerSwipe({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const doOpen = useCallback(() => {
    setOpen(true);
  }, [setOpen]);

  /** Cierre inmediato para enlaces, fondo y botón. */
  const close = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let startX = 0;
    let startY = 0;
    let tracking: "close" | null = null;
    let done = false;

    const onStart = (e: TouchEvent) => {
      tracking = null;
      done = false;
      if (e.touches.length !== 1 || !window.matchMedia(MOBILE_QUERY).matches) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      if (openRef.current) tracking = "close";
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking || done || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      // Un gesto más vertical que horizontal es desplazamiento normal: se suelta.
      if (Math.abs(dy) > Math.abs(dx) * 1.2 && Math.abs(dy) > 12) {
        tracking = null;
        return;
      }
      if (tracking === "close" && dx < -CLOSE_DISTANCE) {
        done = true;
        setOpen(false);
      }
    };
    const onEnd = () => {
      tracking = null;
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
    };
  }, [setOpen]);

  return { open: doOpen, close };
}
