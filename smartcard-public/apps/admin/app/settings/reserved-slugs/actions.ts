'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { logAdminAction } from '../../../lib/audit'

function backTo(error: string): never {
  redirect(`/settings?error=${error}`)
}

const SLUG_FORMAT = /^[a-z0-9][a-z0-9_.-]*$/

export async function addReservedSlugAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/settings?error=forbidden')
  }

  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()

  if (!slug) {
    backTo('missing_fields')
  }
  if (!SLUG_FORMAT.test(slug)) {
    backTo('invalid_slug')
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('reserved_slugs').insert({ slug })

  if (error) {
    backTo(error.code === '23505' ? 'slug_taken' : 'save_failed')
  }

  await logAdminAction(supabase, {
    action: 'reserved_slug.created',
    entity_type: 'reserved_slug',
    entity_id: null,
    after_data: { slug },
  })

  revalidatePath('/settings')
  redirect('/settings')
}

export async function deleteReservedSlugAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/settings?error=forbidden')
  }

  const slug = String(formData.get('slug') ?? '')

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('reserved_slugs').delete().eq('slug', slug)

  if (error) {
    backTo('save_failed')
  }

  await logAdminAction(supabase, {
    action: 'reserved_slug.deleted',
    entity_type: 'reserved_slug',
    entity_id: null,
    before_data: { slug },
  })

  revalidatePath('/settings')
  redirect('/settings')
}
