'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient, type Json } from '@reymen/database'
import { getCurrentAdmin } from '../../../../lib/current-admin'
import { logAdminAction } from '../../../../lib/audit'
import { buildThemeConfig } from '../../../../lib/theme-config'

function backToForm(error: string): never {
  redirect(`/settings/themes/new?error=${error}`)
}

export async function createThemeAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/settings?error=forbidden')
  }

  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()

  if (!name || !slug) {
    backToForm('missing_fields')
  }

  const config = buildThemeConfig(formData)
  if (!config) {
    backToForm('invalid_config')
  }

  const supabase = await createServerSupabaseClient()

  const { data: theme, error } = await supabase
    .from('themes')
    .insert({ name, slug, config: config as Json })
    .select('id')
    .single()

  if (error || !theme) {
    backToForm(error?.code === '23505' ? 'slug_taken' : 'save_failed')
  }

  await logAdminAction(supabase, {
    action: 'theme.created',
    entity_type: 'theme',
    entity_id: theme.id,
    after_data: { name, slug, config },
  })

  revalidatePath('/settings')
  redirect('/settings')
}
