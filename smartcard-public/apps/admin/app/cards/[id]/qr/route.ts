import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@reymen/database'
import { buildCardQrTargetUrl, generateCardQrPng } from '@reymen/lib'
import { getPublicSiteUrl } from '../../../../lib/public-site-url'

// El `proxy.ts` del panel ya exige sesión válida en toda ruta salvo
// /login y /auth/confirm (ver ese archivo) -- esta hereda esa protección
// sin nada adicional aquí, igual que cualquier otra página de /cards.
//
// `?download=1` fuerza la descarga con un nombre de archivo útil
// (`REY-000003.png`); sin ese parámetro responde igual pero sin
// Content-Disposition, para usarse directo en un <img src="..."> de vista
// previa en /cards/[id].
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const download = request.nextUrl.searchParams.get('download') === '1'

  const supabase = await createServerSupabaseClient()
  const { data: card } = await supabase
    .from('cards')
    .select('card_code')
    .eq('id', id)
    .maybeSingle()

  if (!card?.card_code) {
    return new NextResponse('Tarjeta no encontrada.', { status: 404 })
  }

  const targetUrl = buildCardQrTargetUrl(getPublicSiteUrl(), card.card_code)
  const png = await generateCardQrPng(targetUrl)

  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'private, no-store',
      ...(download
        ? { 'Content-Disposition': `attachment; filename="${card.card_code}.png"` }
        : {}),
    },
  })
}
