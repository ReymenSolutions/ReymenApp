/**
 * Contraste WCAG entre dos colores (Fase 17, accesibilidad). Vive en
 * `packages/lib` junto con theme-tokens.ts -- misma razón que esa whitelist:
 * apps/admin lo necesita al guardar un theme (advertir de colores poco
 * legibles) y, si algún día apps/public quiere resolver un color de texto
 * dinámicamente en vez de usar los fijos de ProfileView.tsx, la misma
 * función serviría ahí sin duplicarla.
 *
 * Fórmula de luminancia relativa y razón de contraste tal como la define
 * WCAG 2.x (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance) -- no hay
 * atajo más simple que sea correcto; una comparación ingenua de brillo
 * (ej. promedio de RGB) da falsos positivos/negativos en varios pares de
 * colores reales.
 */

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!match) return null
  const int = parseInt(match[1], 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function channelLuminance(channel: number): number {
  const c = channel / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/**
 * Razón de contraste entre dos colores `#RRGGBB`, de 1 (idénticos) a 21
 * (negro sobre blanco). Devuelve `null` si algún color no es un hex válido
 * -- quien llama decide qué hacer (buildThemeConfig ya valida el formato
 * antes, así que en la práctica esto no debería pasar con datos que vienen
 * de ese flujo).
 */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const rgbA = hexToRgb(hexA)
  const rgbB = hexToRgb(hexB)
  if (!rgbA || !rgbB) return null

  const lumA = relativeLuminance(rgbA)
  const lumB = relativeLuminance(rgbB)
  const lighter = Math.max(lumA, lumB)
  const darker = Math.min(lumA, lumB)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Umbral AA de WCAG: 4.5:1 para texto normal, 3:1 para texto grande/íconos
 * (>=18pt o >=14pt bold -- ver criterio 1.4.11 para elementos no textuales,
 * que usa el mismo umbral de 3:1). */
export function passesWcagAA(hexA: string, hexB: string, largeOrIcon = false): boolean {
  const ratio = contrastRatio(hexA, hexB)
  if (ratio === null) return true // color inválido: buildThemeConfig ya lo rechaza aparte, no es este chequeo el que debe fallar por eso.
  return ratio >= (largeOrIcon ? 3 : 4.5)
}
