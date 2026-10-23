'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { logAdminAction } from '../../../lib/audit'
import { describeSaveError } from '../../../lib/db-errors'

function backToForm(clientId: string, error: string): never {
  const qs = new URLSearchParams({ error })
  if (clientId) qs.set('client_id', clientId)
  redirect(`/cards/new?${qs.toString()}`)
}

export async function createCardAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || (admin.role !== 'SUPERADMIN' && admin.role !== 'ADMIN')) {
    redirect('/cards?error=forbidden')
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
    backToForm(client_id, 'missing_fields')
  }

  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // card_code nunca se manda -- lo genera set_card_code() por trigger
  // (Fase 2, functions_and_triggers.sql) a partir de card_code_seq.
  const { data: card, error } = await supabase
    .from('cards')
    .insert({
      client_id,
      destination_type,
      profile_id,
      destination_url,
      notes,
      status,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()

  if (error || !card) {
    backToForm(client_id, describeSaveError(error))
  }

  await logAdminAction(supabase, {
    action: 'card.created',
    entity_type: 'card',
    entity_id: card.id,
    after_data: { client_id, destination_type, profile_id, destination_url, status },
  })

  revalidatePath('/cards')
  revalidatePath(`/clients/${client_id}`)
  redirect(`/cards/${card.id}`)
}
