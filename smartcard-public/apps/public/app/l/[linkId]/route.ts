import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient, type LinkForRedirect } from '@reymen/database'
import { logPublicEvent, parseSource } from '../../../lib/track'

/**
 * Clic en un link de la lista del perfil (Fase 11) -- pasa por
 * `get_link_for_redirect()` (nueva en esta fase, ver la migración
 * `20260909120001`) en vez de aceptar la URL de destino como parámetro,
 * para no abrir un open redirect: el destino siempre sale de la propia fila
 * de `profile_links`, nunca de lo que mande el cliente.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const { linkId } = await params
  const source = parseSource(request.nextUrl.searchParams.get('src'))
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_link_for_redirect', { p_link_id: linkId })

  if (error) {
    console.error('[click] get_link_for_redirect falló:', error.message)
    return new NextResponse('Ocurrió un error.', { status: 500 })
  }
  if (!data) {
    return new NextResponse('Link no encontrado.', { status: 404 })
  }

  const link = data as unknown as LinkForRedirect

  await logPublicEvent(supabase, {
    event_type: 'custom_link_click',
    source,
    profile_slug: link.profile_slug,
    link_id: linkId,
  })

  return NextResponse.redirect(link.url, { status: 302 })
}
