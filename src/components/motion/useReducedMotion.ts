"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

// Sin matchMedia (entornos de prueba, navegadores muy viejos) se asume movimiento normal.
const supported = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

function subscribe(callback: () => void) {
  if (!supported()) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/** true si la persona pidió menos movimiento en su sistema (en el servidor se asume que no). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => supported() && window.matchMedia(QUERY).matches,
    () => false,
  );
}
