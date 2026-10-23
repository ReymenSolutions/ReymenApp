import { headers } from 'next/headers'

/**
 * URL "oficial" del sitio público, para el `<link rel="canonical">` de cada
 * perfil (ARCHITECTURE.md sección 98: `/n/{code}` y `/q/{code}` renderizan
 * el perfil directamente -- equivalente a un rewrite interno -- pero el
 * canonical siempre apunta a `link.reymensolutions.mx/{slug}`, la URL
 * pensada para compartirse y para SEO/Open Graph, nunca a la de NFC/QR).
 * Mismo mecanismo que `getAdminUrl()` en apps/admin: `NEXT_PUBLIC_SITE_URL`
 * si está definida, si no se deriva del propio request.
 */
export async function getSiteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL

  const h = await headers()
  const host = h.get('host')
  if (host) {
    const isLocal = host.startsWith('127.0.0.1') || host.startsWith('localhost')
    return `${isLocal ? 'http' : 'https'}://${host}`
  }

  return 'http://127.0.0.1:3000'
}
