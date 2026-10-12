"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { MOTION } from "@/lib/motion";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Anima la reorganización de una lista (técnica FLIP): cada elemento con data-flip-id que cambia de lugar
 * entre un render y el siguiente "viaja" desde su posición anterior a la nueva, solo con transform.
 * Las posiciones se miden relativas al contenedor, así que desplazarse por la página no cuenta como cambio.
 */
export function useFlip(container: RefObject<HTMLElement | null>, layoutKey: string) {
  const reduced = useReducedMotion();
  const previous = useRef(new Map<string, { x: number; y: number }>());

  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;
    const origin = root.getBoundingClientRect();
    const next = new Map<string, { x: number; y: number }>();
    root.querySelectorAll<HTMLElement>("[data-flip-id]").forEach((node) => {
      const id = node.dataset.flipId!;
      const rect = node.getBoundingClientRect();
      const pos = { x: rect.left - origin.left + root.scrollLeft, y: rect.top - origin.top + root.scrollTop };
      next.set(id, pos);
      const before = previous.current.get(id);
      if (before && !reduced && (Math.abs(before.x - pos.x) > 1 || Math.abs(before.y - pos.y) > 1)) {
        node.animate([{ transform: `translate(${before.x - pos.x}px, ${before.y - pos.y}px)` }, { transform: "translate(0, 0)" }], {
          duration: MOTION.enter,
          easing: "cubic-bezier(0.22, 0.61, 0.36, 1)",
        });
      }
    });
    previous.current = next;
  }, [container, layoutKey, reduced]);
}
