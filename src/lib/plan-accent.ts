// Color de diferenciación de cada plan (sutil: un borde superior, un fondo muy suave y la insignia). Se elige en Admin → Planes y
// se ve igual en todas las pantallas. Las clases van completas (no armadas con texto) para que Tailwind las incluya.

export const PLAN_ACCENTS = ["slate", "blue", "amber", "emerald", "violet", "rose"] as const;
export type PlanAccent = (typeof PLAN_ACCENTS)[number];

type Tone = { label: { es: string; en: string }; swatch: string; card: string; border: string; badge: string; dot: string };

export const ACCENT_TONES: Record<PlanAccent, Tone> = {
  slate: { label: { es: "Gris", en: "Gray" }, swatch: "bg-slate-400", card: "border-t-4 border-t-slate-300 bg-slate-50/50", border: "border-slate-300", badge: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  blue: { label: { es: "Azul", en: "Blue" }, swatch: "bg-blue-500", card: "border-t-4 border-t-blue-300 bg-blue-50/40", border: "border-blue-300", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  amber: { label: { es: "Ámbar", en: "Amber" }, swatch: "bg-amber-500", card: "border-t-4 border-t-amber-300 bg-amber-50/40", border: "border-amber-300", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  emerald: { label: { es: "Verde", en: "Green" }, swatch: "bg-emerald-500", card: "border-t-4 border-t-emerald-300 bg-emerald-50/40", border: "border-emerald-300", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  violet: { label: { es: "Violeta", en: "Violet" }, swatch: "bg-violet-500", card: "border-t-4 border-t-violet-300 bg-violet-50/40", border: "border-violet-300", badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  rose: { label: { es: "Rosa", en: "Rose" }, swatch: "bg-rose-500", card: "border-t-4 border-t-rose-300 bg-rose-50/40", border: "border-rose-300", badge: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
};

/** Tono de un plan; un valor desconocido cae en gris. */
export function accentTone(accent: string | null | undefined): Tone {
  return ACCENT_TONES[(PLAN_ACCENTS as readonly string[]).includes(accent ?? "") ? (accent as PlanAccent) : "slate"];
}
