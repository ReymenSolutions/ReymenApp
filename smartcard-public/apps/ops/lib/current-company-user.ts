import { createServerSupabaseClient } from '@reymen/database'

export interface CurrentCompanyUser {
  userId: string
  email: string | null
  companyId: string
  companyName: string
  companySlug: string
  roleCode: string
}

/**
 * Sesión + membresía activa del usuario actual, para Server Components de
 * apps/ops. A diferencia de apps/admin (donde un admin ve TODAS las
 * empresas), aquí un usuario puede tener más de una fila en company_users --
 * la mayoría tendrá una sola (REYMEN_OPS_PLAN.md sección 6). Fase 1: se
 * toma la primera membresía activa, sin selector de empresa todavía -- eso
 * es trabajo de Fase 2/3, no bloquea el checklist de Fase 1.
 *
 * Devuelve `null` si no hay sesión o no hay ninguna membresía activa --
 * proxy.ts ya filtró ambos casos antes de llegar aquí (redirige a /login o
 * /no-access), esto es una segunda capa de defensa, no la primera.
 */
export async function getCurrentCompanyUser(): Promise<CurrentCompanyUser | null> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: membership } = await supabase
    .from('company_users')
    .select('company_id, role_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (!membership) return null

  const [{ data: company }, { data: role }] = await Promise.all([
    supabase.from('companies').select('name, slug').eq('id', membership.company_id).maybeSingle(),
    supabase.from('roles').select('code').eq('id', membership.role_id).maybeSingle(),
  ])

  if (!company || !role) return null

  return {
    userId: user.id,
    email: user.email ?? null,
    companyId: membership.company_id,
    companyName: company.name,
    companySlug: company.slug,
    roleCode: role.code,
  }
}
