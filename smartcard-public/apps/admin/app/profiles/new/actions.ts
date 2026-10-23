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
  redirect(`/profiles/new?${qs.toString()}`)
}

export async function createProfileAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || (admin.role !== 'SUPERADMIN' && admin.role !== 'ADMIN')) {
    redirect('/profiles?error=forbidden')
  }

  const client_id = String(formData.get('client_id') ?? '').trim()
  const slug = String(formData.get('slug') ?? '')
    .trim()
    .toLowerCase()
  const display_name = String(formData.get('display_name') ?? '').trim()
  const first_name = String(formData.get('first_name') ?? '').trim() || null
  const last_name = String(formData.get('last_name') ?? '').trim() || null
  const job_title = String(formData.get('job_title') ?? '').trim() || null
  const company = String(formData.get('company') ?? '').trim() || null
  const bio = String(formData.get('bio') ?? '').trim() || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  const whatsapp = String(formData.get('whatsapp') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim() || null
  const website = String(formData.get('website') ?? '').trim() || null
  const theme_id = String(formData.get('theme_id') ?? '').trim() || null
  const status = formData.get('status') === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'

  if (!client_id || !slug || !display_name) {
    backToForm(client_id, 'missing_fields')
  }

  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: profile, error } = await supabase
    .from('profiles')
    .insert({
      client_id,
      slug,
      display_name,
      first_name,
      last_name,
      job_title,
      company,
      bio,
      phone,
      whatsapp,
      email,
      website,
      theme_id,
      status,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()

  if (error || !profile) {
    backToForm(client_id, describeSaveError(error))
  }

  await logAdminAction(supabase, {
    action: 'profile.created',
    entity_type: 'profile',
    entity_id: profile.id,
    after_data: { slug, display_name, client_id, status },
  })

  revalidatePath('/profiles')
  revalidatePath(`/clients/${client_id}`)
  redirect(`/profiles/${profile.id}`)
}
