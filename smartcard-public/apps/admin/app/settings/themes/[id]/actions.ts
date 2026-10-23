'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient, type Json } from '@reymen/database'
import { getCurrentAdmin } from '../../../../lib/current-admin'
import { logAdminAction } from '../../../../lib/audit'
import { buildThemeConfig } from '../../../../lib/theme-config'

function backTo(id: string, error: string): never {
  redirect(`/settings/themes/${id}?error=${error}`)
}

export async function updateThemeAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/settings?error=forbidden')
  }

  const id = String(formData.get('id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  const is_active = formData.get('is_active') !== 'false'

  if (!id || !name || !slug) {
    backTo(id, 'missing_fields')
  }

  const config = buildThemeConfig(formData)
  if (!config) {
    backTo(id, 'invalid_config')
  }

  const supabase = await createServerSupabaseClient()

  const { data: before } = await supabase
    .from('themes')
    .select('name, slug, config, is_active')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase
    .from('themes')
    .update({ name, slug, config: config as Json, is_active })
    .eq('id', id)

  if (error) {
    backTo(id, error.code === '23505' ? 'slug_taken' : 'save_failed')
  }

  await logAdminAction(supabase, {
    action: 'theme.updated',
    entity_type: 'theme',
    entity_id: id,
    before_data: before ?? null,
    after_data: { name, slug, config, is_active },
  })

  revalidatePath('/settings')
  revalidatePath(`/settings/themes/${id}`)
  redirect(`/settings/themes/${id}?saved=1`)
}
