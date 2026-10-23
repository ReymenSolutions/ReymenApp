/**
 * URL pública de `apps/public` -- necesaria aquí (Fase 12) para construir la
 * URL real que codifica el QR de una tarjeta (`{siteUrl}/q/{card_code}`).
 * A diferencia de `getAdminUrl()` (`admin-url.ts`), no se puede derivar del
 * propio request: el panel corre en su propio origen/puerto (3001), no en
 * el de `apps/public` (3000) -- son dos apps distintas del monorepo, así
 * que la única fuente confiable es la variable de entorno, con el puerto
 * local de desarrollo como fallback razonable.
 */
export function getPublicSiteUrl(): string {
  return process.env.PUBLIC_SITE_URL ?? 'http://127.0.0.1:3000'
}
