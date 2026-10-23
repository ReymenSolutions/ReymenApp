/**
 * Ported verbatim from reymen-smartcard's packages/lib/src/link-icons.ts
 * (same reasoning as smartcard-theme.ts: a separate, non-monorepo app can't
 * import that package directly). Deliberately standalone and side-effect
 * free — no Supabase/service-role import — so it's safe to pull into a
 * "use client" component (SmartcardProfileLinksPanel) without dragging
 * smartcard-admin.ts's server-only code into the browser bundle.
 */
export const LINK_ICON_OPTIONS = [
  { value: "", label: "Genérico (por default)" },
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "reviews", label: "Reseñas (estrella)" },
  { value: "phone", label: "Teléfono" },
  { value: "email", label: "Correo" },
  { value: "maps", label: "Ubicación" },
  { value: "mercadolibre", label: "Mercado Libre" },
  { value: "shopping", label: "Compras / ventas (carrito)" },
] as const;

export type LinkIconKey = (typeof LINK_ICON_OPTIONS)[number]["value"];

const VALID_LINK_ICONS = new Set<string>(LINK_ICON_OPTIONS.map((o) => o.value).filter(Boolean));

/** `null`/`''`/cualquier valor fuera de la whitelist deben caer al ícono
 * genérico — nunca un error, ni en el formulario ni al guardar. */
export function isValidLinkIcon(value: string): boolean {
  return VALID_LINK_ICONS.has(value);
}
