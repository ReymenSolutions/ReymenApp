/**
 * Contraste WCAG entre dos colores — portado de reymen-smartcard
 * (packages/lib/src/contrast.ts) para el editor de "tema básico" del
 * perfil digital self-service (primary_color/accent_color sobre
 * profiles.theme_overrides). Misma fórmula, misma razón para no usar un
 * atajo más simple (una comparación ingenua de brillo da falsos
 * positivos/negativos en varios pares de colores reales): luminancia
 * relativa y razón de contraste tal como las define WCAG 2.x
 * (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance).
 *
 * No se importa el paquete original porque reymen-smartcard es un
 * monorepo aparte (no publicado) — mismo criterio ya usado por
 * smartcard-company.ts para el resto de esta integración (portar la
 * lógica, no importarla).
 */

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/**
 * Razón de contraste entre dos colores `#RRGGBB`, de 1 (idénticos) a 21
 * (negro sobre blanco). `null` si algún color no es un hex válido.
 */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const rgbA = hexToRgb(hexA);
  const rgbB = hexToRgb(hexB);
  if (!rgbA || !rgbB) return null;

  const lumA = relativeLuminance(rgbA);
  const lumB = relativeLuminance(rgbB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Umbral AA de WCAG: 4.5:1 para texto normal, 3:1 para texto grande/íconos.
 * Un color inválido no reprueba aquí — el formulario ya rechaza eso aparte
 * (HEX_COLOR), este chequeo es solo la advertencia de legibilidad.
 */
export function passesWcagAA(hexA: string, hexB: string, largeOrIcon = false): boolean {
  const ratio = contrastRatio(hexA, hexB);
  if (ratio === null) return true;
  return ratio >= (largeOrIcon ? 3 : 4.5);
}

/**
 * Whitelist de tokens de `themes.config` — portado de reymen-smartcard's
 * packages/lib/src/theme-tokens.ts (Fase 10/11 allá). Usado por el editor
 * completo de temas en /admin/smartcard/settings (a diferencia del "tema
 * básico" de arriba, acotado a 2 colores — esto es el catálogo real que
 * theme_id referencia). Son exactamente los mismos 4 themes sembrados en
 * seed_themes.sql — nada inventado aquí tampoco.
 */
export const LAYOUT_OPTIONS = [
  { value: "minimal", label: "Minimal" },
  { value: "corporate", label: "Corporate" },
  { value: "real_estate", label: "Real Estate" },
] as const;

export const BORDER_RADIUS_OPTIONS = [
  { value: "sm", label: "Chico" },
  { value: "md", label: "Mediano" },
  { value: "lg", label: "Grande" },
] as const;

export const FONT_OPTIONS = [{ value: "inter", label: "Inter" }] as const;

export interface ThemeConfigFields {
  layout: string;
  primaryColor: string;
  accentColor: string;
  font: string;
  borderRadius: string;
  darkBackground: boolean;
}

/** Usado para precargar el formulario de edición de un theme — mismos
 * defaults que el lado de reymen-smartcard cuando un campo falta. */
export function parseThemeConfig(config: unknown): ThemeConfigFields {
  const c = (config ?? {}) as Record<string, unknown>;
  return {
    layout: typeof c.layout === "string" ? c.layout : "minimal",
    primaryColor: typeof c.primary_color === "string" ? c.primary_color : "#111111",
    accentColor: typeof c.accent_color === "string" ? c.accent_color : "#4F46E5",
    font: typeof c.font === "string" ? c.font : "inter",
    borderRadius: typeof c.border_radius === "string" ? c.border_radius : "md",
    darkBackground: c.background === "dark",
  };
}

/** Reconstruye el objeto `config` entero a partir de campos controlados —
 * mismo criterio que buildThemeConfig del lado de reymen-smartcard: nunca
 * acepta JSON libre, valida cada valor contra su whitelist antes de armar
 * el objeto. `null` si algo no es válido. */
export function buildThemeConfig(fields: ThemeConfigFields): Record<string, unknown> | null {
  if (!LAYOUT_OPTIONS.some((o) => o.value === fields.layout)) return null;
  if (!FONT_OPTIONS.some((o) => o.value === fields.font)) return null;
  if (!BORDER_RADIUS_OPTIONS.some((o) => o.value === fields.borderRadius)) return null;
  if (!HEX_COLOR.test(fields.primaryColor) || !HEX_COLOR.test(fields.accentColor)) return null;

  const config: Record<string, unknown> = {
    layout: fields.layout,
    primary_color: fields.primaryColor,
    accent_color: fields.accentColor,
    font: fields.font,
    border_radius: fields.borderRadius,
  };
  if (fields.darkBackground) config.background = "dark";
  return config;
}

export interface CardTokens {
  primary: string;
  accent: string;
  dark: boolean;
}

/**
 * Colores con los que se ve de verdad la tarjeta pública: la configuración del tema del perfil
 * (ej. «Real Estate») y, encima, los colores propios del perfil si son válidos — mismo orden de
 * prioridad que mergeThemeConfig de la tarjeta (los ajustes del perfil ganan campo por campo).
 */
export function resolveCardTokens(themeConfig: unknown, primaryOverride?: string | null, accentOverride?: string | null): CardTokens {
  const base = parseThemeConfig(themeConfig);
  return {
    primary: primaryOverride && HEX_COLOR.test(primaryOverride) ? primaryOverride : base.primaryColor,
    accent: accentOverride && HEX_COLOR.test(accentOverride) ? accentOverride : base.accentColor,
    dark: base.darkBackground,
  };
}
