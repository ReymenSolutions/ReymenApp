import { headers } from 'next/headers'
import { createServerSupabaseClient } from '@reymen/database'
import { isBotUserAgent, detectDeviceType } from '@reymen/lib'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Metadata de la petición actual (user-agent, referrer, tipo de dispositivo,
 * si parece bot) -- se calcula una vez por request y se pasa a cada llamada
 * de `log_event()` que haga falta en esa misma petición (una página puede
 * loguear más de un evento, ej. nfc_scan + profile_view).
 */
export async function getRequestMeta() {
  const h = await headers()
  const userAgent = h.get('user-agent')
  const referrer = h.get('referer')
  return {
    userAgent,
    referrer,
    deviceType: detectDeviceType(userAgent),
    isBot: isBotUserAgent(userAgent),
  }
}

/** Valida el `?src=` que ProfileView reenvía a las rutas de clic (/c, /l) --
 * cualquier valor que no sea exactamente NFC/QR cae a DIRECT, nunca se
 * confía en el string crudo del query param. */
export function parseSource(value: string | null): 'NFC' | 'QR' | 'DIRECT' {
  if (value === 'NFC' || value === 'QR') return value
  return 'DIRECT'
}

export interface LogEventParams {
  event_type: string
  source: 'NFC' | 'QR' | 'DIRECT'
  card_code?: string | null
  profile_slug?: string | null
  link_id?: string | null
}

/**
 * Único camino para escribir en `events` desde apps/public -- vía
 * `log_event()` (Fase 2, SECURITY DEFINER, otorgada a `anon`). Igual que
 * `logAdminAction` en apps/admin (Fase 5): un fallo al auditar/trackear
 * nunca debe tumbar la respuesta real (la redirección o el render del
 * perfil ya deben pasar aunque el registro falle) -- por eso solo se loguea
 * en consola, nunca se relanza el error.
 */
export async function logPublicEvent(supabase: SupabaseClient, params: LogEventParams) {
  const meta = await getRequestMeta()

  const { error } = await supabase.rpc('log_event', {
    p_event_type: params.event_type,
    p_source: params.source,
    p_card_code: params.card_code ?? null,
    p_profile_slug: params.profile_slug ?? null,
    p_link_id: params.link_id ?? null,
    p_user_agent: meta.userAgent,
    p_referrer: meta.referrer,
    p_device_type: meta.deviceType,
    p_is_bot: meta.isBot,
  })

  if (error) {
    console.error('[track] log_event falló:', params.event_type, error.message)
  }
}
