'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'

/**
 * Único formulario "con estado" de apps/public (Fase 17) -- todo lo demás en
 * este app es un `<a href>`/Route Handler sin JavaScript de cliente (ver el
 * comentario de ProfileView.tsx sobre esa decisión). Un Server Action con un
 * `<form action={...}>` normal funciona igual sin JS -- envío por navegación
 * completa, como cualquier <form> -- así que no rompe ese principio, solo
 * usa el mecanismo que ya existe en apps/admin (login/actions.ts,
 * forgot-password/actions.ts) en vez de inventar un Route Handler nuevo para
 * un solo formulario.
 */
export async function submitPublicFeedbackAction(formData: FormData) {
  const message = String(formData.get('message') ?? '').trim()
  const contactEmail = String(formData.get('contact_email') ?? '').trim()
  const profileSlug = String(formData.get('profile_slug') ?? '').trim()
  const pageUrl = String(formData.get('page_url') ?? '').trim()

  const backTo = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    redirect(`/feedback?${qs}`)
  }

  if (!message) {
    backTo({ error: 'missing_message', ...(profileSlug ? { slug: profileSlug } : {}) })
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.rpc('submit_feedback', {
    p_source: 'public_profile',
    p_message: message,
    p_contact_email: contactEmail || null,
    p_profile_slug: profileSlug || null,
    p_page_url: pageUrl || null,
  })

  if (error) {
    console.error('[feedback] submit_feedback falló:', error.message)
    backTo({ error: 'save_failed', ...(profileSlug ? { slug: profileSlug } : {}) })
  }

  backTo({ sent: '1' })
}
