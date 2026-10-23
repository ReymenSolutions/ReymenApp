'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { logAdminAction } from '../../../lib/audit'

function backTo(error: string): never {
  redirect(`/settings?error=${error}`)
}

// Nota deliberada: editar `requires_profile`/`requires_url` de un tipo de
// destino YA existente no está expuesto aquí -- esos dos valores son los que
// lee `validate_card_destination()` (Fase 2) para decidir qué campo exige
// cada tarjeta que ya usa ese tipo. Cambiarlos con tarjetas existentes
// podría dejarlas en un estado que el propio trigger ya no aceptaría en su
// próxima edición, sin ningún aviso previo. `label`, `is_active` y
// `sort_order` son seguros de cambiar en cualquier momento; para una regla
// de validación distinta, la vía segura es dar de alta un tipo nuevo.
export async function createDestinationTypeAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/settings?error=forbidden')
  }

  const code = String(formData.get('code') ?? '').trim().toUpperCase()
  const label = String(formData.get('label') ?? '').trim()
  const requires_profile = formData.get('requires_profile') === 'on'
  const requires_url = formData.get('requires_url') === 'on'
  const sort_order = Number(formData.get('sort_order') ?? 0) || 0

  if (!code || !label) {
    backTo('missing_fields')
  }
  if (!/^[A-Z0-9_]+$/.test(code)) {
    backTo('invalid_code')
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('destination_types')
    .insert({ code, label, requires_profile, requires_url, sort_order })

  if (error) {
    backTo(error.code === '23505' ? 'code_taken' : 'save_failed')
  }

  await logAdminAction(supabase, {
    action: 'destination_type.created',
    entity_type: 'destination_type',
    entity_id: null,
    after_data: { code, label, requires_profile, requires_url, sort_order },
  })

  revalidatePath('/settings')
  redirect('/settings')
}

export async function updateDestinationTypeLabelAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/settings?error=forbidden')
  }

  const code = String(formData.get('code') ?? '')
  const label = String(formData.get('label') ?? '').trim()

  if (!code || !label) {
    backTo('missing_fields')
  }

  const supabase = await createServerSupabaseClient()
  const { data: before } = await supabase
    .from('destination_types')
    .select('label')
    .eq('code', code)
    .maybeSingle()

  const { error } = await supabase.from('destination_types').update({ label }).eq('code', code)

  if (error) {
    backTo('save_failed')
  }

  await logAdminAction(supabase, {
    action: 'destination_type.updated',
    entity_type: 'destination_type',
    entity_id: null,
    before_data: before ? { label: before.label, code } : null,
    after_data: { label, code },
  })

  revalidatePath('/settings')
  redirect('/settings')
}

export async function toggleDestinationTypeAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/settings?error=forbidden')
  }

  const code = String(formData.get('code') ?? '')
  const nextActive = formData.get('next_active') === 'true'

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('destination_types')
    .update({ is_active: nextActive })
    .eq('code', code)

  if (error) {
    backTo('save_failed')
  }

  await logAdminAction(supabase, {
    action: nextActive ? 'destination_type.reactivated' : 'destination_type.deactivated',
    entity_type: 'destination_type',
    entity_id: null,
    after_data: { code, is_active: nextActive },
  })

  revalidatePath('/settings')
  redirect('/settings')
}
