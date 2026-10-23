import { type EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@reymen/database'

/**
 * Canjea del lado servidor el `token_hash` + `type` que emite Supabase Auth
 * -- mismo mecanismo, mismo motivo, que apps/admin/app/auth/confirm/route.ts
 * (leer el comentario de ese archivo primero: por qué NO se usa el
 * `action_link`/`/auth/v1/verify` directo -- entrega los tokens en el
 * fragmento de la URL, que nunca llega a un Route Handler).
 *
 * Esta ruta no existía todavía en apps/ops -- `inviteTeamMemberAction`
 * (settings/actions.ts, Bloque 1) ya apuntaba aquí pero la ruta nunca se
 * construyó, así que ese flujo de invitación estaba roto de punta a punta
 * (y sigue incompleto: /set-password tampoco existe en apps/ops todavía,
 * ver el ?next por defecto más abajo). Se agrega ahora porque el bridge de
 * SSO de SmartCard (api/sso/smartcard/route.ts) necesita exactamente este
 * mismo canje para completar el inicio de sesión con `type=magiclink` --
 * ese caso SIEMPRE manda su propio `next=/smartcard` explícito, así que no
 * depende de /set-password. Arreglar el flujo de invitación completo
 * (agregar /set-password a apps/ops) queda fuera de este cambio -- ver
 * RIESGOS en el resumen de esta iteración.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next =
    searchParams.get('next') ?? (type === 'recovery' ? '/set-password?context=recovery' : '/set-password')

  if (token_hash && type) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })

    if (!error) {
      redirect(next)
    }

    console.error('[/auth/confirm] verifyOtp falló:', { type, message: error.message })
  } else {
    console.error('[/auth/confirm] Falta token_hash o type en la URL:', request.url)
  }

  if (type === 'recovery') redirect('/login?error=recovery_link')
  if (type === 'magiclink') redirect('/login?error=sso_link')
  redirect('/login?error=invite_link')
}
