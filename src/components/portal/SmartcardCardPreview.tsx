"use client";

import { Globe, Link as LinkIcon, Mail, MapPin, MessageCircle, Phone, ShoppingCart, Star, Store } from "lucide-react";
import type { ProfileProduct } from "@/lib/smartcard-products";
import { subtitleToCharacteristics } from "@/lib/smartcard-product-input";
import { contrastRatio, HEX_COLOR } from "@/lib/smartcard-theme";

/**
 * Vista previa aproximada de la tarjeta pública mientras se edita. La página
 * real la dibuja reymen-smartcard (otro repo) y el layout de la empresa puede
 * cambiar detalles; esto refleja los datos y los colores que se están
 * editando, no un pixel-perfect de la tarjeta publicada.
 */

export interface CardPreviewData {
  displayName: string;
  jobTitle?: string;
  company?: string;
  bio?: string;
  photoUrl?: string;
  logoUrl?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  address?: string;
  primaryColor?: string;
  accentColor?: string;
}

export interface CardPreviewLink {
  id: string;
  title: string;
  icon?: string | null;
}

const DEFAULT_PRIMARY = "#111111";
const DEFAULT_ACCENT = "#4F46E5";

/** Blanco o negro, el que más contraste dé sobre `bg`. */
function readableOn(bg: string): string {
  const white = contrastRatio(bg, "#FFFFFF") ?? 0;
  const black = contrastRatio(bg, "#000000") ?? 0;
  return white >= black ? "#FFFFFF" : "#000000";
}

function LinkGlyph({ icon }: { icon?: string | null }) {
  const cls = "h-4 w-4 shrink-0";
  switch (icon) {
    case "mercadolibre":
      return <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#FFE600] text-[8px] font-bold text-[#2D3277]">ML</span>;
    case "shopping":
      return <ShoppingCart className={cls} aria-hidden="true" />;
    case "reviews":
      return <Star className={cls} aria-hidden="true" />;
    case "phone":
    case "whatsapp":
      return <Phone className={cls} aria-hidden="true" />;
    case "email":
      return <Mail className={cls} aria-hidden="true" />;
    case "maps":
      return <MapPin className={cls} aria-hidden="true" />;
    default:
      return <LinkIcon className={cls} aria-hidden="true" />;
  }
}

export function SmartcardCardPreview({
  data,
  links,
  products,
  lang,
}: {
  data: CardPreviewData;
  links: CardPreviewLink[];
  products: ProfileProduct[];
  lang: "es" | "en";
}) {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  const primary = HEX_COLOR.test(data.primaryColor ?? "") ? (data.primaryColor as string) : DEFAULT_PRIMARY;
  const accent = HEX_COLOR.test(data.accentColor ?? "") ? (data.accentColor as string) : DEFAULT_ACCENT;
  const onPrimary = readableOn(primary);
  const onAccent = readableOn(accent);
  const initial = (data.displayName.trim()[0] ?? "?").toUpperCase();

  const actions = [
    data.phone?.trim() && { key: "tel", label: t("Llamar", "Call"), icon: <Phone className="h-4 w-4" aria-hidden="true" /> },
    data.whatsapp?.trim() && { key: "wa", label: "WhatsApp", icon: <MessageCircle className="h-4 w-4" aria-hidden="true" /> },
    data.email?.trim() && { key: "mail", label: t("Correo", "Email"), icon: <Mail className="h-4 w-4" aria-hidden="true" /> },
    data.website?.trim() && { key: "web", label: t("Sitio web", "Website"), icon: <Globe className="h-4 w-4" aria-hidden="true" /> },
  ].filter(Boolean) as { key: string; label: string; icon: React.ReactNode }[];

  return (
    <figure aria-label={t("Vista previa de la tarjeta", "Card preview")} className="mx-auto w-full max-w-[300px]">
      <div className="overflow-hidden rounded-[28px] border-[6px] border-slate-800 bg-white shadow-lg">
        <div className="max-h-[560px] overflow-y-auto">
          <div className="px-5 pb-6 pt-8 text-center" style={{ backgroundColor: primary, color: onPrimary }}>
            {data.logoUrl?.trim() && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.logoUrl} alt="" className="mx-auto mb-3 h-8 max-w-[120px] object-contain" />
            )}
            {data.photoUrl?.trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.photoUrl} alt="" className="mx-auto h-20 w-20 rounded-full border-2 object-cover" style={{ borderColor: accent }} />
            ) : (
              <div
                className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-2 text-2xl font-semibold"
                style={{ borderColor: accent, backgroundColor: accent, color: onAccent }}
              >
                {initial}
              </div>
            )}
            <p className="mt-3 text-base font-semibold">{data.displayName.trim() || t("Tu nombre", "Your name")}</p>
            {(data.jobTitle || data.company) && (
              <p className="text-xs opacity-80">{[data.jobTitle, data.company].filter((s) => s?.trim()).join(" · ")}</p>
            )}
          </div>

          <div className="space-y-3 px-4 py-4">
            {data.bio?.trim() && <p className="text-xs leading-relaxed text-slate-600">{data.bio}</p>}

            {actions.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {actions.map((a) => (
                  <span
                    key={a.key}
                    className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium"
                    style={{ backgroundColor: accent, color: onAccent }}
                  >
                    {a.icon}
                    {a.label}
                  </span>
                ))}
              </div>
            )}

            {links.length > 0 && (
              <ul className="space-y-1.5">
                {links.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium text-slate-800"
                    style={{ borderColor: accent }}
                  >
                    <span style={{ color: accent }}>
                      <LinkGlyph icon={l.icon} />
                    </span>
                    <span className="truncate">{l.title}</span>
                  </li>
                ))}
              </ul>
            )}

            {products.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <Store className="h-3 w-3" aria-hidden="true" />
                  {t("Productos", "Products")}
                </p>
                <ul className="grid grid-cols-2 gap-2">
                  {products.map((p) => (
                    <li key={p.id} className="overflow-hidden rounded-lg border border-slate-200">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt="" className="h-20 w-full object-cover" />
                      ) : (
                        <div className="h-20 w-full bg-slate-100" />
                      )}
                      <div className="space-y-0.5 p-2">
                        <p className="truncate text-xs font-medium text-slate-800">{p.title}</p>
                        {p.priceLabel && (
                          <p className="text-xs font-semibold" style={{ color: accent }}>{p.priceLabel}</p>
                        )}
                        {subtitleToCharacteristics(p.subtitle).slice(0, 3).map((c, i) => (
                          <p key={i} className="truncate text-[10px] text-slate-500">{c}</p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.address?.trim() && (
              <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                {data.address}
              </p>
            )}
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-[11px] text-slate-500">
        {t("Vista previa aproximada; la tarjeta publicada puede variar un poco.", "Approximate preview; the published card may differ slightly.")}
      </figcaption>
    </figure>
  );
}
