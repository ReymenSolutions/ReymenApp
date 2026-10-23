import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import type { PublicProfile, createServerSupabaseClient } from '@reymen/database'
import { fetchCardForRedirect, fetchPublicProfile } from './profile'
import { logPublicEvent } from './track'
import { getSiteUrl } from './site-url'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

// A qué evento de `events.event_type` corresponde cada `destination_type`
// que NO es PROFILE -- todos los destinos externos ya guardan la URL final
// completa en `cards.destination_url` (así lo exige `validate_card_destination()`,
// Fase 2), así que redirigir es directo: no hace falta construir nada.
const REDIRECT_EVENT_BY_DESTINATION: Record<string, string> = {
  GOOGLE_REVIEWS: 'google_reviews_redirect',
  WHATSAPP: 'whatsapp_click',
  INSTAGRAM: 'instagram_click',
  MAPS: 'maps_click',
  WEBSITE: 'website_click',
  CUSTOM_URL: 'external_redirect',
}

export type CardScanResult =
  | { kind: 'profile'; profile: PublicProfile; slug: string }
  | { kind: 'inactive' }

/**
 * Resuelve un escaneo real de `/n/{code}` o `/q/{code}` (Fase 11):
 *  - tarjeta inexistente/borrada -> 404
 *  - tarjeta INACTIVE -> mensaje propio (no 404: la tarjeta existe, solo
 *    está desactivada -- distinto de "este código nunca existió")
 *  - destino PROFILE -> registra el escaneo (nfc_scan/qr_scan) Y la vista de
 *    perfil (profile_view) como dos eventos separados -- son cosas
 *    distintas que pasaron en el mismo tap (ver FASE8.md, mismo patrón ya
 *    usado ahí para probar la analítica) -- y devuelve el perfil para que
 *    la página lo renderice ahí mismo, sin redirigir (sección 98 de
 *    ARCHITECTURE.md).
 *  - cualquier otro destino -> registra el escaneo Y el evento específico
 *    de ese destino, y hace un redirect() real (nunca un rewrite: el
 *    destino es una URL externa de verdad).
 *
 * `track: false` (vista previa desde Reymen App, `?preview=1`): hace lo mismo
 * pero sin registrar eventos, para que revisar la tarjeta no infle la analítica.
 */
export async function resolveCardScan(
  supabase: SupabaseClient,
  code: string,
  source: 'NFC' | 'QR',
  options: { track?: boolean } = {}
): Promise<CardScanResult> {
  const track = options.track !== false
  const log: typeof logPublicEvent = async (client, event) => {
    if (track) await logPublicEvent(client, event)
  }
  const card = await fetchCardForRedirect(supabase, code)
  if (!card) notFound()

  if (card.card_status !== 'ACTIVE') {
    return { kind: 'inactive' }
  }

  const scanEventType = source === 'NFC' ? 'nfc_scan' : 'qr_scan'
  await log(supabase, { event_type: scanEventType, source, card_code: code })

  if (card.destination_type === 'PROFILE') {
    if (!card.profile_slug) notFound()

    const profile = await fetchPublicProfile(supabase, card.profile_slug)
    // Con p_card_code (no solo p_profile_slug) para que este profile_view
    // quede también ligado a la tarjeta física que lo originó.
    await log(supabase, { event_type: 'profile_view', source, card_code: code })

    return { kind: 'profile', profile, slug: card.profile_slug }
  }

  const redirectEvent = REDIRECT_EVENT_BY_DESTINATION[card.destination_type] ?? 'external_redirect'
  await log(supabase, { event_type: redirectEvent, source, card_code: code })

  if (!card.destination_url) notFound()
  redirect(card.destination_url)
}

/**
 * Metadata para `/n/{code}` y `/q/{code}` (ARCHITECTURE.md sección 98): el
 * `<link rel="canonical">` de un scan tiene que apuntar a `/{slug}`, igual
 * que en `/[slug]/page.tsx`, aunque la página se renderice "en su propio
 * lugar" sin redirigir -- así un buscador consolida las dos URLs en una
 * sola. A propósito NO usa `resolveCardScan()`: esa función ya registra
 * eventos como efecto secundario, y Next.js llama a `generateMetadata` por
 * separado del componente de página -- reusarla aquí duplicaría cada
 * nfc_scan/qr_scan/profile_view. Esta sí es de solo lectura.
 */
export async function buildCardScanMetadata(
  supabase: SupabaseClient,
  code: string
): Promise<Metadata> {
  const card = await fetchCardForRedirect(supabase, code)
  if (!card || card.card_status !== 'ACTIVE' || card.destination_type !== 'PROFILE' || !card.profile_slug) {
    return {}
  }

  const { data } = await supabase.rpc('get_public_profile', { p_slug: card.profile_slug })
  if (!data) return {}

  const profile = data as { display_name: string; job_title: string | null; company: string | null; bio: string | null; is_noindex: boolean }
  const siteUrl = await getSiteUrl()
  const title = [profile.display_name, profile.company].filter(Boolean).join(' · ')
  const description = profile.bio ?? [profile.job_title, profile.company].filter(Boolean).join(' en ')
  const canonicalUrl = `${siteUrl}/${card.profile_slug}`

  return {
    title,
    description: description || undefined,
    alternates: { canonical: canonicalUrl },
    robots: profile.is_noindex ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url: canonicalUrl },
  }
}
