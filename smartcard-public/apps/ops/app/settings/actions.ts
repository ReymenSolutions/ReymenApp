'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient, createAdminClient } from '@reymen/database'
import { getCurrentCompanyUser } from '../../lib/current-company-user'
import { describeInviteError, describeMembershipError } from '../../lib/db-errors'
import { getOpsUrl } from '../../lib/ops-url'

// Roles que se pueden asignar desde este formulario. "owner" queda fuera a
// propósito -- en v1 cada company tiene un solo owner (quien REYMEN dio de
// alta), reasignarlo no es parte de este bloque.
const INVITABLE_ROLES = ['admin', 'manager', 'staff', 'agent']

function backToSettings(error: string): never {
  redirect(`/settings?error=${error}`)
}

export async function inviteTeamMemberAction(formData: FormData) {
  const user = await getCurrentCompanyUser()
  if (!user || !['owner', 'admin'].includes(user.roleCode)) {
    redirect('/settings?error=forbidden')
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const roleCode = String(formData.get('role_code') ?? '')

  if (!email || !roleCode) backToSettings('missing_fields')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) backToSettings('invalid_email')
  if (!INVITABLE_ROLES.includes(roleCode)) backToSettings('invalid_role')

  const supabase = await createServerSupabaseClient()

  // Pre-check a nivel app: mismo cálculo que hace la policy de RLS
  // `company_users_insert` (20260916120007_plan_limits.sql) -- se repite
  // aquí SOLO para devolver un mensaje preciso ("llegaste a tu límite de
  // integrantes") en vez del genérico que quedaría tras el rollback de
  // auth.admin más abajo. La policy de RLS sigue siendo el límite real: si
  // este pre-check tuviera un bug o quedara desactualizado, el INSERT de
  // company_users de todos modos se bloquea (ver el 42501 más abajo).
  const [{ count: currentSeats }, { data: limitValue }] = await Promise.all([
    supabase
      .from('company_users')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', user.companyId)
      .in('status', ['invited', 'active']),
    supabase.rpc('check_limit', { p_company_id: user.companyId, p_limit_key: 'max_team_members' }),
  ])

  if (limitValue !== null && (currentSeats ?? 0) >= Number(limitValue)) {
    backToSettings('team_limit_reached')
  }

  const { data: role } = await supabase.from('roles').select('id').eq('code', roleCode).maybeSingle()
  if (!role) backToSettings('invalid_role')

  // auth.admin.inviteUserByEmail solo existe en el Auth Admin API -- igual
  // que apps/admin/app/users/new/actions.ts, requiere service_role
  // (packages/database/src/admin.ts). Es la primera vez que apps/ops usa
  // createAdminClient() -- extensión deliberada de la regla documentada ahí
  // ("solo desde apps/admin"): invitar un company_users necesita el mismo
  // endpoint de Auth Admin, y apps/ops ya trae SUPABASE_SERVICE_ROLE_KEY en
  // su .env.production desde Fase 1 (copiado del de apps/admin, ver
  // FASE1_OPS_CORE.md paso 3) precisamente para este momento.
  const adminClient = createAdminClient()
  const opsUrl = await getOpsUrl()

  const { data, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${opsUrl}/auth/confirm`,
  })

  if (inviteError || !data?.user) {
    backToSettings(describeInviteError(inviteError))
  }

  const { error: membershipError } = await supabase.from('company_users').insert({
    company_id: user.companyId,
    user_id: data.user.id,
    role_id: role.id,
    status: 'invited',
  })

  if (membershipError) {
    console.error(
      '[ops/settings] company_users insert falló, revirtiendo auth.users huérfano:',
      membershipError.message
    )
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(data.user.id)
    if (rollbackError) {
      console.error('[ops/settings] No se pudo revertir el usuario huérfano:', rollbackError.message)
    }
    backToSettings(describeMembershipError(membershipError))
  }

  revalidatePath('/settings')
  redirect('/settings?saved=1')
}
