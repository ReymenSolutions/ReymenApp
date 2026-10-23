import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@reymen/database'
import { buildVCard, type VCardData } from '@reymen/lib'
import { logPublicEvent } from '../../../../lib/track'

/**
 * Descarga de vCard (botón "Guardar contacto" del perfil, Fase 11) --
 * `get_vcard_data()` (Fase 2) ya devuelve exactamente los campos que un
 * .vcf necesita, nada más. Cada descarga cuenta como el evento
 * `save_contact` -- es justo la acción que ese evento existe para medir.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc('get_vcard_data', { p_slug: slug })

  if (error) {
    console.error('[vcard] get_vcard_data falló:', error.message)
    return new NextResponse('No se pudo generar la tarjeta de contacto.', { status: 500 })
  }
  if (!data) {
    return new NextResponse('Perfil no encontrado.', { status: 404 })
  }

  const vcard = buildVCard(data as unknown as VCardData)

  await logPublicEvent(supabase, { event_type: 'save_contact', source: 'DIRECT', profile_slug: slug })

  return new NextResponse(vcard, {
    status: 200,
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slug}.vcf"`,
      'Cache-Control': 'no-store',
    },
  })
}
