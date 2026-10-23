'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'

/**
 * No hay registro público (sección 70): esta acción solo intenta iniciar
 * sesión contra cuentas que ya existen en Supabase Auth. Si las credenciales
 * no coinciden, el mensaje es siempre el mismo genérico -- nunca se revela
 * si el correo existe o no (evita enumeración de cuentas).
 */
export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  // Solo se acepta una ruta relativa como destino post-login -- nunca una
  // URL absoluta, para no abrir un open redirect vía ?next=https://...
  const rawNext = String(formData.get('next') ?? '')
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/'

  if (!email || !password) {
    redirect('/login?error=invalid_credentials')
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Fase 16: antes esto fallaba en silencio -- sin rate limiting en
    // ninguna capa (ver FASE16.md sección 0/3), este es el único rastro que
    // queda de un intento de fuerza bruta contra el login. Nunca se loguea
    // la contraseña, solo el correo intentado y el motivo que da Supabase.
    console.error('[login] signInWithPassword falló:', { email, message: error.message })
    redirect('/login?error=invalid_credentials')
  }

  // Si la cuenta existe pero está inactiva (o no tiene admin_profiles), el
  // middleware la detecta y cierra la sesión en la siguiente request -- no
  // se duplica esa validación aquí.
  redirect(next)
}
