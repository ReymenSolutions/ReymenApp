import { createServerSupabaseClient } from '@reymen/database'

export interface CurrentAdmin {
  id: string
  email: string | null
  full_name: string
  role: 'SUPERADMIN' | 'ADMIN' | 'VIEWER'
  is_active: boolean
}

/**
 * Sesión + perfil administrativo del usuario actual, para usar en Server
 * Components. Devuelve `null` si no hay sesión o no hay fila en
 * `admin_profiles` -- en la práctica el middleware ya filtró ambos casos
 * antes de llegar aquí, esto es una segunda capa de defensa, no la primera.
 */
export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('full_name, role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  return { id: user.id, email: user.email ?? null, ...profile }
}
