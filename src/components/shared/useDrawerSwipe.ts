"use client";

import { useCallback, useEffect, useRef } from "react";

// Gesto para el menú lateral en pantallas chicas: deslizar hacia la derecha desde el borde izquierdo lo abre y deslizarlo
// hacia la izquierda lo cierra. El gesto solo cuenta si es claramente horizontal, para no confundirse con el desplazamiento
// vertical ni con el de "jalar para actualizar". Un toque fantasma sobre el fondo justo al abrir no lo cierra.

const EDGE_PX = 28; // zona del borde donde empieza el gesto de abrir
const OPEN_DISTANCE = 56;
const CLOSE_DISTANCE = 56;
const LOCK_MS = 400; // tras abrir, ignora cierres por toque (el "clic" que el navegador genera al soltar el dedo)
const MOBILE_QUERY = "(max-width: 1023px)";

export function useDrawerSwipe({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const openedAt = useRef(0);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const doOpen = useCallback(() => {
    openedAt.current = Date.now();
    setOpen(true);
  }, [setOpen]);

  /** Cierre del menú (fondo, enlaces, botón): ignora el que llega pegado a una apertura. */
  const close = useCallback(() => {
    if (Date.now() - openedAt.current < LOCK_MS) return;
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let startX = 0;
    let startY = 0;
    let tracking: "open" | "close" | null = null;
    let done = false;

    const onStart = (e: TouchEvent) => {
      tracking = null;
      done = false;
      if (e.touches.length !== 1 || !window.matchMedia(MOBILE_QUERY).matches) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      if (!openRef.current && startX <= EDGE_PX) tracking = "open";
      else if (openRef.current) tracking = "close";
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
      if (tracking === "open" && dx > OPEN_DISTANCE) {
        done = true;
        doOpen();
      } else if (tracking === "close" && dx < -CLOSE_DISTANCE && Date.now() - openedAt.current >= LOCK_MS) {
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
  }, [doOpen, setOpen]);

  return { open: doOpen, close };
}
