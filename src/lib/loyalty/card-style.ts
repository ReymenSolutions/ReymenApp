// Pure module. Diseño de la tarjeta de lealtad que ve el cliente (como la
// SmartCard): color de fondo, color de acento (sellos y etiquetas) e ícono.
// Sin elegir nada se ve igual que siempre (azul de la marca y naranja).

export const CARD_ICONS = [
  "coffee",
  "utensils",
  "pizza",
  "croissant",
  "ice-cream",
  "beer",
  "wine",
  "sandwich",
  "scissors",
  "sparkles",
  "dumbbell",
  "shopping-bag",
  "paw-print",
  "car",
  "heart",
  "star",
  "gift",
] as const;
export type CardIconKey = (typeof CARD_ICONS)[number];

export const DEFAULT_CARD_COLOR = "#0B1E4F";
export const DEFAULT_CARD_ACCENT = "#F97316";
export const DEFAULT_CARD_ICON: CardIconKey = "gift";

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (v: string | null | undefined): v is string => !!v && HEX.test(v);
export const isCardIcon = (v: string | null | undefined): v is CardIconKey => !!v && (CARD_ICONS as readonly string[]).includes(v);

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")}`;
}
/** Luminancia relativa (WCAG). */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
/** Mezcla un color hacia negro (amount > 0) o blanco (< 0). */
function shade(hex: string, amount: number): string {
  const c = rgb(hex);
  const target = amount > 0 ? 0 : 255;
  const t = Math.abs(amount);
  return toHex(c.map((v) => v + (target - v) * t) as [number, number, number]);
}

export interface CardStyle {
  /** Color de la tarjeta en hex (para Wallet, que no acepta degradados). */
  base: string;
  background: string;
  /** Texto principal: blanco o casi negro, el que contraste más con el fondo. */
  text: string;
  /** Texto secundario. */
  muted: string;
  accent: string;
  /** Texto sobre el acento (sellos ganados). */
  onAccent: string;
  /** Fondo del recuadro de sellos y sellos vacíos. */
  soft: string;
  icon: CardIconKey;
  dark: boolean;
}

export function cardStyle(p: { cardColor?: string | null; cardAccent?: string | null; cardIcon?: string | null }): CardStyle {
  const base = isHexColor(p.cardColor) ? p.cardColor : DEFAULT_CARD_COLOR;
  const accent = isHexColor(p.cardAccent) ? p.cardAccent : DEFAULT_CARD_ACCENT;
  const dark = contrast(base, "#FFFFFF") >= contrast(base, "#111827");
  return {
    base,
    background: `linear-gradient(135deg, ${base} 0%, ${shade(base, dark ? 0.35 : 0.12)} 100%)`,
    text: dark ? "#FFFFFF" : "#111827",
    muted: dark ? "rgba(255,255,255,0.78)" : "rgba(17,24,39,0.7)",
    accent,
    onAccent: contrast(accent, "#FFFFFF") >= contrast(accent, "#111827") ? "#FFFFFF" : "#111827",
    soft: dark ? "rgba(255,255,255,0.12)" : "rgba(17,24,39,0.08)",
    icon: isCardIcon(p.cardIcon) ? p.cardIcon : DEFAULT_CARD_ICON,
    dark,
  };
}
