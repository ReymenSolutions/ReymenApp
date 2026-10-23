'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { logAdminAction } from '../../../lib/audit'
import { describeSaveError } from '../../../lib/db-errors'

const VALID_ROLES = ['SUPERADMIN', 'ADMIN', 'VIEWER']

function backTo(id: string, error: string): never {
  redirect(`/users/${id}?error=${error}`)
}

export async function updateAdminAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/users?error=forbidden')
  }

  const id = String(formData.get('id') ?? '')
  const full_name = String(formData.get('full_name') ?? '').trim()
  const isSelf = id === admin.id

  if (!id || !full_name) {
    backTo(id, 'missing_fields')
  }

  const supabase = await createServerSupabaseClient()

  const { data: before } = await supabase
    .from('admin_profiles')
    .select('full_name, role')
    .eq('id', id)
    .maybeSingle()

  if (!before) backTo(id, 'save_failed')

  // El <select> de rol está deshabilitado en la UI cuando isSelf (no se
  // manda en el FormData) -- pero por si acaso alguien arma la petición a
  // mano, aquí también se ignora cualquier rol distinto al que ya tenía:
  // nadie puede cambiar su propio rol, ni por UI ni saltándosela.
  const submittedRole = String(formData.get('role') ?? '')
  const role = isSelf
    ? before.role
    : VALID_ROLES.includes(submittedRole)
      ? submittedRole
      : before.role

  const { error } = await supabase
    .from('admin_profiles')
    .update({ full_name, role: role as 'SUPERADMIN' | 'ADMIN' | 'VIEWER' })
    .eq('id', id)

  if (error) {
    backTo(id, describeSaveError(error))
  }

  // Mismo matiz que card.destination_changed en Fase 7: cambiar el rol de un
  // admin es más significativo que cambiarle el nombre, así que queda como
  // su propia acción en vez de un admin_user.updated genérico.
  await logAdminAction(supabase, {
    action: role !== before.role ? 'admin_user.role_changed' : 'admin_user.updated',
    entity_type: 'admin_user',
    entity_id: id,
    before_data: { full_name: before.full_name, role: before.role },
    after_data: { full_name, role },
  })

  revalidatePath('/users')
  revalidatePath(`/users/${id}`)
  redirect(`/users/${id}?saved=1`)
}

export async function deactivateAdminAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/users?error=forbidden')
  }

  const id = String(formData.get('id') ?? '')

  if (id === admin.id) {
    backTo(id, 'self_change_forbidden')
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('admin_profiles').update({ is_active: false }).eq('id', id)

  if (error) {
    backTo(id, describeSaveError(error))
  }

  await logAdminAction(supabase, {
    action: 'admin_user.deactivated',
    entity_type: 'admin_user',
    entity_id: id,
  })

  revalidatePath('/users')
  revalidatePath(`/users/${id}`)
  redirect(`/users/${id}?saved=1`)
}

export async function reactivateAdminAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/users?error=forbidden')
  }

  const id = String(formData.get('id') ?? '')

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('admin_profiles').update({ is_active: true }).eq('id', id)

  if (error) {
    backTo(id, describeSaveError(error))
  }

  await logAdminAction(supabase, {
    action: 'admin_user.reactivated',
    entity_type: 'admin_user',
    entity_id: id,
  })

  revalidatePath('/users')
  revalidatePath(`/users/${id}`)
  redirect(`/users/${id}?saved=1`)
}
