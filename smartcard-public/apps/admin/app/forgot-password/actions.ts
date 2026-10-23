'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'
import { getAdminUrl } from '../../lib/admin-url'

/**
 * Pide a Supabase Auth que mande el correo de recuperación (Fase 13,
 * AUTH.md sección 7: "se agrega junto con la fase de gestión de
 * usuarios"). A diferencia de `/users/new` (Fase 9), esto NO usa
 * `createAdminClient()` -- `resetPasswordForEmail` es parte de la API
 * pública de Auth (no la Admin API), pensada justo para que la llame
 * alguien sin sesión.
 *
 * Sin registro público (sección 70), pero eso no cambia nada aquí: si el
 * correo no corresponde a ninguna cuenta, Supabase Auth simplemente no
 * manda nada -- y esta acción redirige al mismo mensaje de éxito de todas
 * formas (mismo principio que `login()`, sección "nunca revelar si el
 * correo existe" -- si el mensaje cambiara según exista o no la cuenta,
 * cualquiera podría usar este formulario para enumerar qué correos tienen
 * acceso al panel).
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()

  if (!email) {
    redirect('/forgot-password?error=missing_email')
  }

  const supabase = await createServerSupabaseClient()
  const adminUrl = await getAdminUrl()

  // Fase 16: se loguea cada solicitud (no solo las que fallan) -- sin rate
  // limiting en ninguna capa (FASE16.md sección 0/3), esto es lo único que
  // permite notar si alguien está golpeando este formulario en bucle contra
  // un correo (o varios). Solo a la terminal -- el usuario siempre ve el
  // mismo mensaje de éxito, sin importar el resultado real (comentario de
  // arriba).
  console.log('[forgot-password] solicitud de recuperación para:', email)

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${adminUrl}/auth/confirm`,
  })

  if (error) {
    console.error('[forgot-password] resetPasswordForEmail falló:', error.message)
  }

  redirect('/forgot-password?sent=1')
}
