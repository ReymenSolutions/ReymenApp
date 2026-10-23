/**
 * Whitelist de íconos elegibles para un link del perfil público (Fase 17.1
 * -- pedido explícito del usuario: "que cuando agregues links puedas
 * escoger ciertos iconos... como si es reseñas 5 estrellas, instagram sea
 * como el signo"). `profile_links.icon` (columna desde Fase 2) existía sin
 * usarse: nada la llenaba desde el formulario de admin ni nada la leía en
 * ProfileView.tsx (siempre pintaba el mismo ícono de globo genérico).
 *
 * Vive en `packages/lib` por el mismo motivo que `theme-tokens.ts`: apps/admin
 * necesita la lista para el <select> del formulario, apps/public necesita
 * las mismas claves para resolver qué ícono pintar -- una sola fuente de
 * verdad evita que se desincronicen (un ícono nuevo agregado de un lado sin
 * el otro).
 *
 * Set fijo y curado a propósito (decisión del usuario, no un uploader de
 * ícono propio) -- mismo criterio que ya rige theme_config: "tokens
 * seguros, nunca algo libre/arbitrario".
 */
export const LINK_ICON_OPTIONS = [
  { value: '', label: 'Genérico (por default)' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'reviews', label: 'Reseñas (estrella)' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'email', label: 'Correo' },
  { value: 'maps', label: 'Ubicación' },
] as const

export type LinkIconKey = (typeof LINK_ICON_OPTIONS)[number]['value']

const VALID_LINK_ICONS = new Set<string>(LINK_ICON_OPTIONS.map((o) => o.value).filter(Boolean))

/** `null`/`''`/cualquier valor fuera de la whitelist caen todos al ícono
 * genérico -- nunca un error, ni en el formulario ni al renderizar (un
 * `icon` viejo o corrupto en la base no debe tumbar el perfil público). */
export function isValidLinkIcon(value: string): boolean {
  return VALID_LINK_ICONS.has(value)
}
