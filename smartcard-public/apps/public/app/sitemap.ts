import type { MetadataRoute } from 'next'
import { createServerSupabaseClient } from '@reymen/database'
import { getSiteUrl } from '../lib/site-url'

/**
 * Sitemap dinámico (convención de archivo de Next.js -- se sirve solo en
 * /sitemap.xml, sin ruta propia que armar a mano). Se apoya en
 * `get_public_profile_slugs()` (migración 20260911120001), la única forma
 * en que apps/public puede leer algo de `profiles` -- RLS no le da a `anon`
 * ningún acceso directo a la tabla (mismo principio que ya sigue
 * `[slug]/page.tsx` con `get_public_profile`).
 *
 * Se listan solo perfiles ACTIVE, no marcados `is_noindex` y no borrados --
 * los mismos tres criterios que ya decide si ese perfil se indexa o no
 * (`generateMetadata` de `[slug]/page.tsx` pone `robots: { index: false }`
 * exactamente cuando `is_noindex` es true). No tendría sentido listar en el
 * sitemap un perfil que la propia metadata le pide a los buscadores no
 * indexar.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createServerSupabaseClient()
  const siteUrl = await getSiteUrl()
  const { data } = await supabase.rpc('get_public_profile_slugs')

  const profiles = (data ?? []) as { slug: string; updated_at: string }[]

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
    },
    ...profiles.map((profile) => ({
      url: `${siteUrl}/${profile.slug}`,
      lastModified: new Date(profile.updated_at),
    })),
  ]
}
