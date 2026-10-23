import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient, type PublicProfile } from '@reymen/database'
import { logPublicEvent, parseSource } from '../../../../lib/track'

// Cada botón de contacto/red social del perfil pasa por aquí en vez de un
// href directo (tel:/wa.me/mailto:/la URL guardada) -- así el clic se
// registra en `events` del lado servidor, sin JavaScript de cliente, antes
// de mandar al destino real con un redirect de verdad (ver FASE11.md
// sección 3). El destino SIEMPRE se resuelve aquí, desde los propios datos
// del perfil -- nunca se acepta una URL como parámetro del cliente, para no
// abrir un open redirect.
const EVENT_TYPE_BY_KIND: Record<string, string> = {
  call: 'call_click',
  whatsapp: 'whatsapp_click',
  email: 'email_click',
  website: 'website_click',
  maps: 'maps_click',
  instagram: 'instagram_click',
  facebook: 'facebook_click',
  linkedin: 'linkedin_click',
  // events.event_type (Fase 2) no tiene un valor propio para tiktok/youtube
  // -- son campos que se agregaron a `profiles` después de fijar ese enum.
  // 'custom_link_click' es el catch-all más cercano; documentado en
  // FASE11.md como una limitación conocida, no un descuido.
  tiktok: 'custom_link_click',
  youtube: 'custom_link_click',
}

function resolveTarget(profile: PublicProfile, kind: string): string | null {
  switch (kind) {
    case 'call':
      return profile.phone ? `tel:${profile.phone.replace(/\s+/g, '')}` : null
    case 'whatsapp':
      return profile.whatsapp ? `https://wa.me/${profile.whatsapp.replace(/\D/g, '')}` : null
    case 'email':
      return profile.email ? `mailto:${profile.email}` : null
    case 'website':
      return profile.website
    case 'maps':
      if (profile.maps_url) return profile.maps_url
      if (profile.address) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.address)}`
      }
      return null
    case 'instagram':
      return profile.instagram
    case 'facebook':
      return profile.facebook
    case 'linkedin':
      return profile.linkedin
    case 'tiktok':
      return profile.tiktok
    case 'youtube':
      return profile.youtube
    default:
      return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; kind: string }> }
) {
  const { slug, kind } = await params
  const source = parseSource(request.nextUrl.searchParams.get('src'))
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_public_profile', { p_slug: slug })

  if (error) {
    console.error('[click] get_public_profile falló:', error.message)
    return new NextResponse('Ocurrió un error.', { status: 500 })
  }
  if (!data) {
    return new NextResponse('Perfil no encontrado.', { status: 404 })
  }

  const profile = data as unknown as PublicProfile
  const target = resolveTarget(profile, kind)
  const eventType = EVENT_TYPE_BY_KIND[kind]

  if (!target || !eventType) {
    return new NextResponse('Destino no disponible.', { status: 404 })
  }

  await logPublicEvent(supabase, { event_type: eventType, source, profile_slug: slug })

  return NextResponse.redirect(target, { status: 302 })
}
