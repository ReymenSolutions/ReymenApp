'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { logAdminAction } from '../../../lib/audit'

export async function updateClientAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/clients')

  const admin = await getCurrentAdmin()
  if (!admin || (admin.role !== 'SUPERADMIN' && admin.role !== 'ADMIN')) {
    redirect(`/clients/${id}?error=forbidden`)
  }

  const name = String(formData.get('name') ?? '').trim()
  const business_name = String(formData.get('business_name') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim() || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null
  const status = formData.get('status') === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'

  if (!name) {
    redirect(`/clients/${id}?error=missing_name`)
  }

  const supabase = await createServerSupabaseClient()

  // Se lee el estado anterior antes de sobreescribirlo -- audit_logs guarda
  // before/after de cada cambio (ver comentario de la tabla en
  // audit_logs.sql), no solo el estado final.
  const { data: before } = await supabase
    .from('clients')
    .select('name, business_name, email, phone, notes, status')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('clients')
    .update({ name, business_name, email, phone, notes, status })
    .eq('id', id)

  if (error) {
    redirect(`/clients/${id}?error=save_failed`)
  }

  await logAdminAction(supabase, {
    action: 'client.updated',
    entity_type: 'client',
    entity_id: id,
    before_data: before ?? null,
    after_data: { name, business_name, email, phone, notes, status },
  })

  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  redirect(`/clients/${id}?saved=1`)
}

export async function softDeleteClientAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/clients')

  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect(`/clients/${id}?error=forbidden`)
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('clients')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    redirect(`/clients/${id}?error=save_failed`)
  }

  await logAdminAction(supabase, {
    action: 'client.deleted',
    entity_type: 'client',
    entity_id: id,
  })

  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  redirect('/clients?deleted=1')
}

export async function reactivateClientAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/clients')

  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect(`/clients/${id}?error=forbidden`)
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('clients').update({ deleted_at: null }).eq('id', id)

  if (error) {
    redirect(`/clients/${id}?error=save_failed`)
  }

  await logAdminAction(supabase, {
    action: 'client.reactivated',
    entity_type: 'client',
    entity_id: id,
  })

  revalidatePath('/clients')
  revalidatePath(`/clients/${id}`)
  redirect(`/clients/${id}?saved=1`)
}
