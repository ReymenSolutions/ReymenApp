/**
 * Heurística mínima por user-agent para `events.device_type`. A propósito
 * no se agrega una dependencia externa (ej. ua-parser-js) solo para esto --
 * "mobile / tablet / desktop / unknown" es toda la granularidad que el
 * producto necesita (contar escaneos, no huella digital del dispositivo).
 */
export function detectDeviceType(
  userAgent: string | null | undefined
): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (!userAgent) return 'unknown'
  const ua = userAgent.toLowerCase()

  if (/ipad|tablet(?!.*mobile)|kindle|playbook|silk/.test(ua)) return 'tablet'
  if (/mobi|iphone|ipod|android.*mobile|windows phone|blackberry/.test(ua)) return 'mobile'
  if (/android/.test(ua)) return 'tablet' // Android sin "Mobile" en el UA suele ser tablet.
  if (/windows|macintosh|linux|cros/.test(ua)) return 'desktop'

  return 'unknown'
}
