import { type EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@reymen/database'

/**
 * Consume el link de invitación (o de recuperación, mismo mecanismo) que
 * manda Supabase Auth por correo. Deliberadamente NO usa el endpoint de
 * verificación propio de Supabase (`/auth/v1/verify`) como destino directo
 * del correo -- ese entrega los tokens en el fragmento (#) de la URL, que
 * nunca llega al servidor de Next.js. En su lugar, la plantilla de correo
 * (supabase/templates/invite.html, ver AUTH.md) apunta aquí con
 * `token_hash` + `type` en query string, que sí puede leer un Route Handler
 * y canjear del lado servidor con `verifyOtp` -- el patrón recomendado por
 * Supabase para apps con SSR.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  // Fase 13: invitación y recuperación llegan aquí por el mismo mecanismo
  // (Supabase solo distingue el `type` del token), y las dos terminan en
  // /set-password -- pero el mensaje correcto es distinto ("crea tu
  // contraseña" vs. "restablécela"). En vez de que /set-password tenga que
  // adivinar, se lo decimos explícito con `?context=recovery`.
  const next =
    searchParams.get('next') ?? (type === 'recovery' ? '/set-password?context=recovery' : '/set-password')

  if (token_hash && type) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })

    if (!error) {
      redirect(next)
    }

    // Se imprime en la terminal donde corre `next dev` (no en el navegador)
    // -- es el mensaje real que da Supabase Auth, necesario para saber si el
    // problema es un token expirado, ya usado, o algo distinto.
    console.error('[/auth/confirm] verifyOtp falló:', { type, message: error.message })
  } else {
    console.error('[/auth/confirm] Falta token_hash o type en la URL:', request.url)
  }

  // Mismo motivo real (token vencido/ya usado/faltante) puede venir de una
  // invitación o de una recuperación -- el mensaje en /login debe nombrar
  // la que realmente corresponde, no siempre "invitación".
  redirect(type === 'recovery' ? '/login?error=recovery_link' : '/login?error=invite_link')
}
