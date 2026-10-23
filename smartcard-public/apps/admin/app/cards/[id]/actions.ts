'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { logAdminAction } from '../../../lib/audit'
import { describeSaveError } from '../../../lib/db-errors'

export async function updateCardAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/cards')

  const admin = await getCurrentAdmin()
  if (!admin || (admin.role !== 'SUPERADMIN' && admin.role !== 'ADMIN')) {
    redirect(`/cards/${id}?error=forbidden`)
  }

  const client_id = String(formData.get('client_id') ?? '').trim()
  const destination_type = String(formData.get('destination_type') ?? '').trim()
  const profile_id = String(formData.get('profile_id') ?? '').trim() || null
  const destination_url = String(formData.get('destination_url') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null
  const status = (formData.get('status') === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') as
    | 'ACTIVE'
    | 'INACTIVE'

  if (!client_id || !destination_type) {
    redirect(`/cards/${id}?error=missing_fields`)
  }

  const supabase = await createServerSupabaseClient()

  const { data: before } = await supabase
    .from('cards')
    .select('client_id, destination_type, profile_id, destination_url, notes, status')
    .eq('id', id)
    .single()

  const payload = { client_id, destination_type, profile_id, destination_url, notes, status }

  const { error } = await supabase.from('cards').update(payload).eq('id', id)

  if (error) {
    redirect(`/cards/${id}?error=${describeSaveError(error)}`)
  }

  // "Cambiar el destino de una tarjeta sin tocar la tarjeta física" es
  // literalmente el mecanismo central del producto (ARCHITECTURE.md sección
  // 1) -- por eso ese cambio en particular queda registrado con un nombre de
  // acción distinto (card.destination_changed, el mismo ejemplo que ya
  // sugería el comentario de audit_logs en Fase 2), no como un
  // card.updated genérico más.
  const destinationChanged =
    !!before &&
    (before.destination_type !== destination_type ||
      before.profile_id !== profile_id ||
      before.destination_url !== destination_url)

  await logAdminAction(supabase, {
    action: destinationChanged ? 'card.destination_changed' : 'card.updated',
    entity_type: 'card',
    entity_id: id,
    before_data: before ?? null,
    after_data: payload,
  })

  revalidatePath('/cards')
  revalidatePath(`/cards/${id}`)
  redirect(`/cards/${id}?saved=1`)
}

export async function softDeleteCardAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/cards')

  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect(`/cards/${id}?error=forbidden`)
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('cards')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    redirect(`/cards/${id}?error=save_failed`)
  }

  await logAdminAction(supabase, {
    action: 'card.deleted',
    entity_type: 'card',
    entity_id: id,
  })

  revalidatePath('/cards')
  revalidatePath(`/cards/${id}`)
  redirect('/cards?deleted=1')
}

export async function reactivateCardAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/cards')

  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect(`/cards/${id}?error=forbidden`)
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('cards').update({ deleted_at: null }).eq('id', id)

  if (error) {
    redirect(`/cards/${id}?error=save_failed`)
  }

  await logAdminAction(supabase, {
    action: 'card.reactivated',
    entity_type: 'card',
    entity_id: id,
  })

  revalidatePath('/cards')
  revalidatePath(`/cards/${id}`)
  redirect(`/cards/${id}?saved=1`)
}
