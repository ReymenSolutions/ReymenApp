'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient, createAdminClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { logAdminAction } from '../../../lib/audit'
import { describeInviteError } from '../../../lib/db-errors'
import { getAdminUrl } from '../../../lib/admin-url'

const VALID_ROLES = ['SUPERADMIN', 'ADMIN', 'VIEWER']

function backToForm(error: string): never {
  redirect(`/users/new?error=${error}`)
}

export async function inviteAdminAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/users?error=forbidden')
  }

  const full_name = String(formData.get('full_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const role = String(formData.get('role') ?? '')

  if (!full_name || !email || !VALID_ROLES.includes(role)) {
    backToForm('missing_fields')
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    backToForm('invalid_email')
  }

  // auth.admin.inviteUserByEmail solo existe en el Auth Admin API -- requiere
  // service_role, no el cliente de sesión normal (ver packages/database/src/admin.ts).
  const adminClient = createAdminClient()
  const adminUrl = await getAdminUrl()

  const { data, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${adminUrl}/auth/confirm`,
  })

  if (inviteError || !data?.user) {
    backToForm(describeInviteError(inviteError))
  }

  const supabase = await createServerSupabaseClient()

  // Se escribe con el cliente de sesión normal (no el de service_role) a
  // propósito -- admin_profiles sí tiene RLS (admin_profiles_write exige
  // SUPERADMIN, ver rls_policies.sql) y ya se validó arriba que quien llama
  // lo es, así que dejar que la policy también lo confirme es la misma
  // filosofía de "tres capas, no una" del resto del panel (FASE5.md sección 3).
  const { error: profileError } = await supabase.from('admin_profiles').insert({
    id: data.user.id,
    full_name,
    role: role as 'SUPERADMIN' | 'ADMIN' | 'VIEWER',
  })

  if (profileError) {
    console.error('[users/new] admin_profiles insert falló, revirtiendo auth.users:', profileError.message)
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(data.user.id)
    if (rollbackError) {
      console.error('[users/new] No se pudo revertir el usuario huérfano:', rollbackError.message)
    }
    backToForm('invite_failed')
  }

  await logAdminAction(supabase, {
    action: 'admin_user.invited',
    entity_type: 'admin_user',
    entity_id: data.user.id,
    after_data: { email, full_name, role },
  })

  revalidatePath('/users')
  redirect('/users')
}
