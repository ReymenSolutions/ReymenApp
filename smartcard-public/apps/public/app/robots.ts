import type { MetadataRoute } from 'next'
import { getSiteUrl } from '../lib/site-url'

/**
 * `/n/`, `/q/`, `/c/` y `/l/` son rutas de solo-redirección (NFC, QR, clic
 * en un botón de contacto, clic en un link -- ver ARCHITECTURE.md sección
 * 98): cada visita registra un evento en `events` y redirige de inmediato,
 * nunca hay contenido propio que indexar ahí. Dejar que un crawler las
 * siga solo generaría tráfico de rastreo sin ningún beneficio de SEO --
 * la URL que sí importa indexar es siempre `/{slug}` (el canonical al que
 * todas esas rutas apuntan).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getSiteUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/n/', '/q/', '/c/', '/l/', '/api/'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
