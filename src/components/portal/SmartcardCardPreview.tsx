"use client";

import { ChevronRight, Globe, Link as LinkIcon, Mail, MapPin, MessageCircle, Phone, ShoppingCart, Star, UserPlus } from "lucide-react";
import type { ProfileProduct } from "@/lib/smartcard-products";
import type { CardTokens } from "@/lib/smartcard-theme";

/**
 * Réplica de la tarjeta pública (apps/public ProfileView en smartcard-public): mismo orden, mismos
 * colores derivados del tema y mismas formas, alimentada con lo que se está editando. El diseño real
 * lo dibuja la app pública; si allá cambia, hay que actualizar esto (el botón «Ver tarjeta real» abre
 * la publicada).
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
  mapsUrl?: string;
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  tiktok?: string;
  youtube?: string;
}

export interface CardPreviewLink {
  id: string;
  title: string;
  icon?: string | null;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function LinkGlyph({ icon, color }: { icon?: string | null; color: string }) {
  const p = { size: 18, color, "aria-hidden": true } as const;
  switch (icon) {
    case "mercadolibre":
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M7.5 15.5v-7l2.2 3.4 2.3-3.4v7M14.5 8.5v7h3" />
        </svg>
      );
    case "shopping":
      return <ShoppingCart {...p} />;
    case "reviews":
      return <Star {...p} />;
    case "phone":
    case "whatsapp":
      return <Phone {...p} />;
    case "email":
      return <Mail {...p} />;
    case "maps":
      return <MapPin {...p} />;
    default:
      return <LinkIcon {...p} />;
  }
}

export function SmartcardCardPreview({
  data,
  links,
  products,
  tokens,
  lang,
}: {
  data: CardPreviewData;
  links: CardPreviewLink[];
  products: ProfileProduct[];
  tokens: CardTokens;
  lang: "es" | "en";
}) {
  const t = (es: string, en: string) => (lang === "es" ? es : en);
  const { primary, accent, dark } = tokens;
  const custom = tokens.background;
  const cardBg = custom ?? (dark ? "#1A1D18" : "#FBF6EF");
  const textPrimary = dark ? "#F3F1EA" : "#242821";
  const textMuted = dark ? "#A9AFA2" : "#52594B";
  // Con fondo propio, borde y chips se derivan del fondo (igual que la tarjeta pública).
  const cardBorder = custom ? `color-mix(in srgb, ${cardBg} 85%, ${textPrimary})` : dark ? "#2E322A" : "#ECE1D2";
  const chipBg = custom ? (dark ? `color-mix(in srgb, ${cardBg} 92%, #FFFFFF)` : `color-mix(in srgb, ${cardBg} 40%, #FFFFFF)`) : dark ? "#20241D" : "#FFFFFF";
  const heroBg = dark ? accent : primary;
  const heroHeight = 96;
  const accentSoft = `color-mix(in srgb, ${accent} 20%, ${chipBg})`;
  const sectionTitle = { margin: "0 0 12px 4px", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: textMuted } as const;

  const contacts = [
    data.phone?.trim() && { key: "call", label: t("Llamar", "Call"), icon: <Phone size={19} color={primary} aria-hidden="true" /> },
    data.whatsapp?.trim() && { key: "wa", label: "WhatsApp", icon: <MessageCircle size={19} color={primary} aria-hidden="true" /> },
    data.email?.trim() && { key: "mail", label: t("Correo", "Email"), icon: <Mail size={19} color={primary} aria-hidden="true" /> },
  ].filter(Boolean) as { key: string; label: string; icon: React.ReactNode }[];
  const socialCount = [data.instagram, data.facebook, data.linkedin, data.tiktok, data.youtube].filter((s) => s?.trim()).length;

  return (
    <figure aria-label={t("Vista previa de la tarjeta", "Card preview")} className="mx-auto w-full max-w-[312px]">
      <div className="overflow-hidden rounded-[28px] border-[6px] border-slate-800 shadow-lg">
        <div className="max-h-[600px] overflow-y-auto" style={{ background: cardBg }}>
          {/* zoom: la tarjeta se dibuja a su tamaño real de teléfono (390 px) y se reduce para caber */}
          <div style={{ width: 390, zoom: 0.76, position: "relative", background: cardBg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: heroHeight, background: heroBg, zIndex: 0 }}>
              {data.logoUrl?.trim() && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.logoUrl} alt="" style={{ position: "absolute", top: 16, left: 16, height: 28, opacity: 0.92 }} />
              )}
            </div>

            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: `${heroHeight - 56}px 24px 44px` }}>
              <div style={{ width: 112, height: 112, borderRadius: 9999, background: cardBg, padding: 4, boxShadow: "0 10px 26px rgba(27,67,50,0.28)", flexShrink: 0 }}>
                {data.photoUrl?.trim() ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.photoUrl} alt="" style={{ width: "100%", height: "100%", borderRadius: 9999, objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", borderRadius: 9999, background: `linear-gradient(135deg, ${accent}, #EDD3B2)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: primary, letterSpacing: "-0.02em" }}>{initials(data.displayName)}</span>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 18, textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: textPrimary, letterSpacing: "-0.015em" }}>{data.displayName.trim() || t("Tu nombre", "Your name")}</p>
                {data.jobTitle?.trim() && <p style={{ margin: "7px 0 0", fontSize: 14, fontWeight: 700, color: accent }}>{data.jobTitle}</p>}
                {data.company?.trim() && <p style={{ margin: "2px 0 0", fontSize: 13, fontWeight: 500, color: textMuted }}>{data.company}</p>}
              </div>

              {data.bio?.trim() && (
                <p style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.55, color: textMuted, textAlign: "center", maxWidth: 290 }}>{data.bio}</p>
              )}

              {contacts.length > 0 && (
                <div style={{ display: "flex", gap: 18, marginTop: 26 }}>
                  {contacts.map((b) => (
                    <span key={b.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 64 }}>
                      <span style={{ width: 56, height: 56, borderRadius: 9999, background: chipBg, border: `1.5px solid ${cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(38,41,33,0.06)" }}>
                        {b.icon}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: textMuted }}>{b.label}</span>
                    </span>
                  ))}
                </div>
              )}

              <span style={{ marginTop: 16, width: "100%", height: 52, borderRadius: 9999, background: accent, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: `0 8px 18px color-mix(in srgb, ${accent} 45%, transparent)` }}>
                <UserPlus size={18} color="#262922" aria-hidden="true" />
                <span style={{ fontSize: 15, fontWeight: 700, color: "#262922" }}>{t("Guardar contacto", "Save contact")}</span>
              </span>

              {links.length > 0 && (
                <div style={{ width: "100%", marginTop: 34 }}>
                  <p style={sectionTitle}>{t("Enlaces", "Links")}</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {links.map((l) => (
                      <span key={l.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: chipBg, border: `1px solid ${cardBorder}`, borderRadius: 20 }}>
                        <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 9999, background: accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <LinkGlyph icon={l.icon} color={primary} />
                        </span>
                        <span style={{ flexGrow: 1, fontSize: 14, fontWeight: 600, color: textPrimary }}>{l.title}</span>
                        <ChevronRight size={16} color="#B7BDAF" aria-hidden="true" />
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {products.length > 0 && (
                <div style={{ width: "100%", marginTop: 34 }}>
                  <p style={sectionTitle}>{t("Productos", "Products")}</p>
                  <div style={{ display: "grid", gridTemplateColumns: products.length > 1 ? "repeat(2, minmax(0, 1fr))" : "1fr", gap: 12 }}>
                    {products.map((p) => (
                      <span key={p.id} style={{ display: "flex", flexDirection: "column", background: chipBg, border: `1px solid ${cardBorder}`, borderRadius: 20, overflow: "hidden" }}>
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" style={{ width: "100%", aspectRatio: "4 / 3", objectFit: "cover", display: "block", background: cardBorder }} />
                        ) : (
                          <span style={{ width: "100%", aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${accent} 18%, ${chipBg})` }}>
                            <Globe size={22} color={primary} aria-hidden="true" />
                          </span>
                        )}
                        <span style={{ display: "flex", flexDirection: "column", gap: 3, padding: "10px 12px 12px" }}>
                          {p.priceLabel && <span style={{ fontSize: 15, fontWeight: 800, color: textPrimary }}>{p.priceLabel}</span>}
                          <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary, lineHeight: 1.3 }}>{p.title}</span>
                          {p.subtitle && <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.3 }}>{p.subtitle}</span>}
                          <span style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: primary, display: "flex", alignItems: "center", gap: 4 }}>
                            {t("Ver detalles", "View details")} <ChevronRight size={12} color={primary} aria-hidden="true" />
                          </span>
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {socialCount > 0 && (
                <div style={{ display: "flex", gap: 14, marginTop: 30 }}>
                  {Array.from({ length: socialCount }, (_, i) => (
                    <span key={i} style={{ width: 44, height: 44, borderRadius: 9999, background: chipBg, border: `1.5px solid ${cardBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Globe size={16} color={primary} aria-hidden="true" />
                    </span>
                  ))}
                </div>
              )}

              {(data.address?.trim() || data.mapsUrl?.trim()) && (
                <span style={{ width: "100%", marginTop: 26, display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: chipBg, border: `1px solid ${cardBorder}`, borderRadius: 20 }}>
                  <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 9999, background: accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <MapPin size={18} color={primary} aria-hidden="true" />
                  </span>
                  <span style={{ flexGrow: 1 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: textPrimary }}>{data.address?.trim() || t("Ver ubicación", "View location")}</span>
                    <span style={{ display: "block", fontSize: 12, color: textMuted, marginTop: 2 }}>{t("Toca para abrir en Maps", "Tap to open in Maps")}</span>
                  </span>
                  <ChevronRight size={16} color="#B7BDAF" aria-hidden="true" />
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-2 text-center text-[11px] text-slate-500">
        {t("Réplica de la tarjeta con lo que estás editando. Los íconos de redes se muestran genéricos.", "Replica of the card with what you're editing. Social icons are shown generic.")}
      </figcaption>
    </figure>
  );
}
