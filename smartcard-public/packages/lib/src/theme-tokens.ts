/**
 * Whitelist de tokens seguros para `themes.config` / `profiles.theme_overrides`
 * (Fase 10, `/settings/themes` en apps/admin; Fase 11, renderizado real en
 * apps/public). Vive en `packages/lib` -- no en `apps/admin` -- porque desde
 * Fase 11 los dos apps la necesitan: admin para el formulario de edición,
 * public para resolver qué colores/layout pintar de verdad. Tenerla en dos
 * copias (una por app) es exactamente el tipo de duplicación que se
 * desincroniza con el tiempo -- si se agrega un layout nuevo aquí y no allá,
 * el panel deja crear algo que el sitio público no sabe renderizar (o
 * viceversa) sin que ningún error lo delate.
 *
 * El comentario original de la columna (Fase 2) pedía "tokens seguros
 * únicamente ... jamás CSS/HTML arbitrario". Los valores de layout/
 * border_radius/font de aquí son los que ya usan los 4 themes sembrados en
 * `seed_themes.sql` -- nada inventado.
 */
export const LAYOUT_OPTIONS = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'real_estate', label: 'Real Estate' },
] as const

export const BORDER_RADIUS_OPTIONS = [
  { value: 'sm', label: 'Chico' },
  { value: 'md', label: 'Mediano' },
  { value: 'lg', label: 'Grande' },
] as const

export const FONT_OPTIONS = [{ value: 'inter', label: 'Inter' }] as const

export interface ThemeConfigFields {
  layout: string
  primary_color: string
  accent_color: string
  font: string
  border_radius: string
  dark_background: boolean
}

function readFields(c: Record<string, unknown>): ThemeConfigFields {
  return {
    layout: typeof c.layout === 'string' ? c.layout : 'minimal',
    primary_color: typeof c.primary_color === 'string' ? c.primary_color : '#111111',
    accent_color: typeof c.accent_color === 'string' ? c.accent_color : '#4F46E5',
    font: typeof c.font === 'string' ? c.font : 'inter',
    border_radius: typeof c.border_radius === 'string' ? c.border_radius : 'md',
    dark_background: c.background === 'dark',
  }
}

/** Usado por apps/admin para precargar el formulario de edición de un theme. */
export function parseThemeConfig(config: unknown): ThemeConfigFields {
  return readFields((config ?? {}) as Record<string, unknown>)
}

/**
 * Usado por apps/public para resolver los tokens finales de un perfil:
 * `profiles.theme_overrides` (Fase 6, "personalización nivel 1" según el
 * comentario original de esa columna) gana sobre `themes.config` campo por
 * campo -- nunca lo reemplaza entero, así que un override que solo trae
 * `accent_color` no le borra el resto de los tokens al theme base.
 */
export function mergeThemeConfig(baseConfig: unknown, overrides: unknown): ThemeConfigFields {
  const base = (baseConfig ?? {}) as Record<string, unknown>
  const over = (overrides ?? {}) as Record<string, unknown>
  return readFields({ ...base, ...over })
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Usado por apps/admin al guardar el formulario de theme -- reconstruye el
 * objeto `config` entero a partir de campos controlados, nunca acepta JSON
 * libre del cliente. */
export function buildThemeConfig(formData: FormData): Record<string, unknown> | null {
  const layout = String(formData.get('layout') ?? '')
  const primary_color = String(formData.get('primary_color') ?? '')
  const accent_color = String(formData.get('accent_color') ?? '')
  const font = String(formData.get('font') ?? '')
  const border_radius = String(formData.get('border_radius') ?? '')
  const dark_background = formData.get('dark_background') === 'on'

  if (!LAYOUT_OPTIONS.some((o) => o.value === layout)) return null
  if (!FONT_OPTIONS.some((o) => o.value === font)) return null
  if (!BORDER_RADIUS_OPTIONS.some((o) => o.value === border_radius)) return null
  if (!HEX_COLOR.test(primary_color) || !HEX_COLOR.test(accent_color)) return null

  const config: Record<string, unknown> = { layout, primary_color, accent_color, font, border_radius }
  if (dark_background) config.background = 'dark'
  return config
}
