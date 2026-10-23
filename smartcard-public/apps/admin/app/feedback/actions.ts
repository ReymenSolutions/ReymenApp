'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'

/**
 * Reporte de problema desde dentro del panel (Fase 17) -- mismo
 * `submit_feedback()` que usa apps/public (supabase/migrations/20260912120002_feedback.sql),
 * solo que aquí `source` va como 'admin_panel' y la función misma resuelve
 * `admin_id` a partir de la sesión ya autenticada (via current_admin_role()),
 * no hace falta mandarlo desde aquí.
 */
export async function submitAdminFeedbackAction(formData: FormData) {
  const message = String(formData.get('message') ?? '').trim()

  if (!message) {
    redirect('/feedback?error=missing_message')
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.rpc('submit_feedback', {
    p_source: 'admin_panel',
    p_message: message,
  })

  if (error) {
    console.error('[feedback] submit_feedback falló:', error.message)
    redirect('/feedback?error=save_failed')
  }

  revalidatePath('/feedback')
  redirect('/feedback?sent=1')
}
