// Frente de la tarjeta de lealtad (lo que ve el cliente). Lo usan la vista
// previa del programa y la tarjeta pública, así se ven idénticas. Sin hooks:
// sirve en servidor y en cliente.

import {
  Beer,
  Car,
  Coffee,
  Croissant,
  Dumbbell,
  Gift,
  Heart,
  IceCreamCone,
  PawPrint,
  Pizza,
  Sandwich,
  Scissors,
  ShoppingBag,
  Sparkles,
  Star,
  Utensils,
  Wine,
  type LucideIcon,
} from "lucide-react";
import { cardStyle, type CardIconKey } from "@/lib/loyalty/card-style";

export const CARD_ICON_COMPONENTS: Record<CardIconKey, LucideIcon> = {
  coffee: Coffee,
  utensils: Utensils,
  pizza: Pizza,
  croissant: Croissant,
  "ice-cream": IceCreamCone,
  beer: Beer,
  wine: Wine,
  sandwich: Sandwich,
  scissors: Scissors,
  sparkles: Sparkles,
  dumbbell: Dumbbell,
  "shopping-bag": ShoppingBag,
  "paw-print": PawPrint,
  car: Car,
  heart: Heart,
  star: Star,
  gift: Gift,
};

export function LoyaltyCardFace({
  style: styleInput,
  topLabel,
  title,
  greeting,
  headline,
  current,
  goal,
  footer,
  quote,
  size = "md",
}: {
  style: { cardColor?: string | null; cardAccent?: string | null; cardIcon?: string | null };
  /** Línea pequeña arriba (negocio o programa). */
  topLabel: string;
  title?: string | null;
  greeting: string;
  /** "7 / 10 visitas". */
  headline: string;
  current: number;
  goal: number;
  footer?: React.ReactNode;
  quote?: string | null;
  size?: "md" | "lg";
}) {
  const s = cardStyle(styleInput);
  const Icon = CARD_ICON_COMPONENTS[s.icon];
  const lg = size === "lg";
  // Hasta 12 visitas se ven como sellos con el ícono; más, como barra.
  const stamps = goal <= 12;
  const stampSize = lg ? 34 : 26;

  return (
    <div className={lg ? "relative overflow-hidden px-6 pb-6 pt-5" : "relative overflow-hidden rounded-2xl p-5 shadow-lg"} style={{ background: s.background, color: s.text }}>
      {/* Ícono grande de fondo, decorativo. */}
      <Icon className="pointer-events-none absolute -right-4 -top-3 opacity-10" style={{ width: lg ? 132 : 108, height: lg ? 132 : 108 }} aria-hidden="true" />
      <div className="relative flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: s.accent, color: s.onAccent }}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: s.accent }}>
          {topLabel}
        </p>
      </div>
      {title && <p className="relative mt-1 text-lg font-bold">{title}</p>}
      <p className={lg ? "relative mt-3 text-lg" : "relative mt-4 text-sm"} style={{ color: s.muted }}>
        {greeting}
      </p>
      <p className={lg ? "relative text-4xl font-bold tabular-nums" : "relative text-3xl font-bold tabular-nums"}>{headline}</p>
      <div className="relative mt-3 rounded-xl p-2.5" style={{ background: s.soft }}>
        {stamps ? (
          <div className="flex flex-wrap gap-1.5" role="img" aria-label={`${current} / ${goal}`}>
            {Array.from({ length: goal }, (_, i) => {
              const done = i < current;
              const last = i === goal - 1;
              return (
                <span
                  key={i}
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: stampSize,
                    height: stampSize,
                    background: done ? s.accent : "transparent",
                    color: done ? s.onAccent : s.text,
                    border: done ? "none" : `1.5px ${last ? "solid" : "dashed"} ${last ? s.accent : s.muted}`,
                    opacity: done || last ? 1 : 0.55,
                  }}
                >
                  {last && !done ? <Gift style={{ width: stampSize * 0.5, height: stampSize * 0.5, color: s.accent }} aria-hidden="true" /> : <Icon style={{ width: stampSize * 0.5, height: stampSize * 0.5 }} aria-hidden="true" />}
                </span>
              );
            })}
          </div>
        ) : (
          <div className="h-2.5 w-full rounded-full" style={{ background: s.soft }} role="img" aria-label={`${current} / ${goal}`}>
            <div className="h-2.5 rounded-full" style={{ width: `${Math.round((current / Math.max(1, goal)) * 100)}%`, background: s.accent }} />
          </div>
        )}
      </div>
      {footer && (
        <div className={lg ? "relative mt-3 text-base" : "relative mt-3 text-sm"} style={{ color: s.muted }}>
          {footer}
        </div>
      )}
      {quote && (
        <p className="relative mt-1 text-xs italic" style={{ color: s.accent }}>
          “{quote}”
        </p>
      )}
    </div>
  );
}
