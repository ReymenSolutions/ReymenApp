import { notFound } from 'next/navigation'
import type { PublicProfile, CardForRedirect, createServerSupabaseClient } from '@reymen/database'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Trae un perfil por slug vía `get_public_profile()` (Fase 2, SECURITY
 * DEFINER) -- el único camino de lectura pública a `profiles`, ya filtrado a
 * exactamente los campos que un perfil público necesita mostrar (sección 99
 * del prompt original: nunca un SELECT * en una API pública). `null` (perfil
 * inexistente, dado de baja, o INACTIVE) siempre resuelve en 404 -- ver
 * FASE11.md sección 2 sobre por qué INACTIVE no distingue un mensaje propio.
 */
export async function fetchPublicProfile(supabase: SupabaseClient, slug: string): Promise<PublicProfile> {
  const { data, error } = await supabase.rpc('get_public_profile', { p_slug: slug })

  if (error) {
    throw new Error(`get_public_profile falló: ${error.message}`)
  }
  if (!data) {
    notFound()
  }

  return data as unknown as PublicProfile
}

/** Trae el destino de una tarjeta vía `get_card_for_redirect()` (Fase 2). */
export async function fetchCardForRedirect(
  supabase: SupabaseClient,
  cardCode: string
): Promise<CardForRedirect | null> {
  const { data, error } = await supabase.rpc('get_card_for_redirect', { p_card_code: cardCode })

  if (error) {
    throw new Error(`get_card_for_redirect falló: ${error.message}`)
  }
  if (!data) return null

  return data as unknown as CardForRedirect
}
