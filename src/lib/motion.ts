// Tiempos y curvas para las animaciones que se hacen en JavaScript (las de CSS usan los tokens de globals.css).
export const MOTION = {
  micro: 180,
  enter: 320,
  panel: 300,
  /** Cifras que cambian: lo bastante largo para verse, lo bastante corto para no estorbar. */
  count: 700,
} as const;

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
