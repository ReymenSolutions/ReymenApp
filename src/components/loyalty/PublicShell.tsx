import { cardStyle } from "@/lib/loyalty/card-style";
import { CARD_ICON_COMPONENTS } from "./LoyaltyCardFace";

type CardTheme = { cardColor?: string | null; cardAccent?: string | null; cardIcon?: string | null };

/**
 * Marco mobile-first de las páginas públicas de Lealtad (inscripción y
 * tarjeta). Usa el diseño de la tarjeta del programa: el fondo toma su color
 * y el ícono de la cabecera es el del programa.
 */
export function PublicShell({ businessName, logoUrl, theme, children }: { businessName: string; logoUrl: string | null; theme?: CardTheme; children: React.ReactNode }) {
  const s = cardStyle(theme ?? {});
  const Icon = CARD_ICON_COMPONENTS[s.icon];
  const base = theme?.cardColor && /^#[0-9a-fA-F]{6}$/.test(theme.cardColor) ? theme.cardColor : "#0B1E4F";
  // Fondo siempre oscuro arriba (para que el nombre en blanco se lea), con el tono de la tarjeta.
  const top = s.dark ? base : `color-mix(in srgb, ${base} 35%, #0B1220)`;
  return (
    <div className="min-h-screen px-4 py-6 sm:py-10" style={{ background: `linear-gradient(to bottom, ${top} 0%, color-mix(in srgb, ${top} 70%, #0B1220) 45%, #f1f5f9 100%)` }}>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-4 flex items-center justify-center gap-2 text-white">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-9 w-9 rounded-lg bg-white object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: s.accent, color: s.onAccent }}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <span className="text-lg font-bold tracking-tight">{businessName}</span>
        </div>
        <main className="overflow-hidden rounded-3xl bg-white shadow-xl">{children}</main>
      </div>
    </div>
  );
}

export function PublicMessage({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <p className="max-w-sm rounded-2xl bg-white p-6 text-center text-slate-600 shadow">{text}</p>
    </div>
  );
}
