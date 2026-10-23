'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'

// Mismo criterio que apps/admin/app/login/actions.ts: sin registro público
// en v1 -- las cuentas de company_users se crean por invitación (owner/admin
// de la empresa, o REYMEN Admin en su nombre), nunca por un formulario
// abierto. Mensaje de error siempre genérico, para no permitir enumeración
// de cuentas.
export async function login(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  const rawNext = String(formData.get('next') ?? '')
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  if (!email || !password) {
    redirect('/login?error=invalid_credentials')
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    console.error('[ops login] signInWithPassword falló:', { email, message: error.message })
    redirect('/login?error=invalid_credentials')
  }

  // Si la cuenta existe pero no tiene ninguna membresía 'active', proxy.ts
  // la manda a /no-access en la siguiente request -- no se duplica esa
  // validación aquí.
  redirect(next)
}
