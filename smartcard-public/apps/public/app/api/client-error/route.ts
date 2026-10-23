import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@reymen/database'
import { logPublicEvent } from '../../../lib/track'

/**
 * Recibe el aviso que manda `app/error.tsx` cuando el error boundary del
 * lado del cliente se activa (Fase 17) -- ese componente corre en el
 * navegador de quien lo vivió, así que un `console.error` ahí solo llega a
 * la consola de ESA persona, nunca a `docker logs`. Esta ruta es el único
 * puente: hace el mismo `console.error('[tag] ...')` pero del lado del
 * servidor (convención de Fase 16), y además cuenta el error como evento
 * `client_error` en la tabla `events` ya existente (ver la migración
 * 20260912120001) para que se pueda ver el volumen desde /analytics en vez
 * de tener que leer logs uno por uno.
 *
 * Nunca falla la respuesta al cliente por esto -- si el propio logueo
 * truena, no hay nada más que hacer que loguearlo también y responder 200
 * de todas formas (mismo criterio que logPublicEvent: registrar nunca debe
 * verse ni sentirse como parte de la experiencia real).
 */
export async function POST(request: Request) {
  let body: { message?: string; digest?: string; path?: string } = {}
  try {
    body = await request.json()
  } catch {
    // Cuerpo inválido/vacío -- no hay nada más que reportar.
  }

  console.error('[client-error] error sin capturar en el navegador:', {
    message: typeof body.message === 'string' ? body.message.slice(0, 500) : null,
    digest: body.digest ?? null,
    path: typeof body.path === 'string' ? body.path.slice(0, 200) : null,
  })

  const supabase = await createServerSupabaseClient()

  // El path es lo único que da una pista de qué perfil estaba viendo --
  // best-effort: si no calza con /{slug}, el evento igual queda registrado,
  // solo que sin profile_slug (log_event() ya maneja profile_slug que no
  // resuelve a ningún perfil real, deja profile_id en null en vez de
  // fallar).
  const slugMatch = typeof body.path === 'string' ? body.path.match(/^\/([a-z0-9-]+)\/?$/) : null

  await logPublicEvent(supabase, {
    event_type: 'client_error',
    source: 'DIRECT',
    profile_slug: slugMatch?.[1] ?? null,
  })

  return NextResponse.json({ ok: true })
}
