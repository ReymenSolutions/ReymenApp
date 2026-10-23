'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'

export async function setPassword(formData: FormData) {
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')
  // Ver el <input type="hidden"> en page.tsx -- así el error regresa al
  // mensaje correcto ("restablece" vs. "crea") en vez de perder el
  // contexto en cuanto hay un primer error de validación.
  const context = String(formData.get('context') ?? '')
  const contextParam = context === 'recovery' ? '&context=recovery' : ''

  if (password.length < 8 || password !== confirmPassword) {
    redirect(`/set-password?error=mismatch${contextParam}`)
  }

  const supabase = await createServerSupabaseClient()

  // Llegar aquí sin sesión (link viejo, cookie perdida) no debe asumir
  // ninguna identidad -- de vuelta a /login, nunca se intenta adivinar a
  // quién pertenece la contraseña.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(context === 'recovery' ? '/login?error=recovery_link' : '/login?error=invite_link')
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    redirect(`/set-password?error=mismatch${contextParam}`)
  }

  redirect('/')
}
