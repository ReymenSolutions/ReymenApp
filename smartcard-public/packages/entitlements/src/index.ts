import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@reymen/database'

// -----------------------------------------------------------------------
// packages/entitlements -- Fase 1 (Core) de REYMEN Ops. Ver
// REYMEN_OPS_PLAN.md sección 8. Sin estado, sin caché propia: se resuelve
// UNA vez por request en el layout protegido de apps/ops (server component)
// y se pasa hacia abajo -- no se vuelve a consultar en cada página.
//
// Esto es SOLO para decidir qué mostrar/navegar. Nunca reemplaza RLS: cada
// tabla real sigue reforzando is_company_member()/has_permission() en la
// base de datos (sección 89 del prompt maestro: "no usar solo navegación
// oculta como seguridad"). Si esta función dice que sí hay acceso a un
// módulo pero RLS dice que no, gana RLS -- este paquete puede tener un bug,
// la base de datos es la única fuente de verdad real.
//
// Sin selects anidados (embeds de PostgREST tipo `roles(code)`): mismo
// criterio que ya usa apps/admin/app/analytics/page.tsx --
// packages/database/src/types.ts declara `Relationships: []` en todas las
// tablas (es un archivo escrito a mano, no generado desde las FKs reales),
// así que un embed anidado no tipa bien y es más frágil que dos consultas
// planas combinadas en JS.
// -----------------------------------------------------------------------

export type ModuleCode = 'smartcard' | 'realty' | 'food' | 'retail' | 'care'

export interface Entitlements {
  companyId: string
  modules: Set<ModuleCode>
  permissions: Set<string>
  roleCode: string | null
  limits: Partial<Record<ModuleCode, Record<string, unknown>>>
}

const EMPTY_ENTITLEMENTS = (companyId: string): Entitlements => ({
  companyId,
  modules: new Set(),
  permissions: new Set(),
  roleCode: null,
  limits: {},
})

/**
 * Resuelve los entitlements de la sesión actual para UNA company. Asume que
 * `supabase` ya trae la sesión del usuario (mismo cliente que
 * `createServerSupabaseClient()` de @reymen/database) -- RLS filtra todo lo
 * que se lee aquí, así que un usuario que no pertenece a `companyId` (o cuya
 * membresía no está 'active') termina con módulos/permisos vacíos en vez de
 * un error.
 */
export async function resolveEntitlements(
  supabase: SupabaseClient<Database>,
  companyId: string
): Promise<Entitlements> {
  const { data: companyUser } = await supabase
    .from('company_users')
    .select('role_id')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .maybeSingle()

  const [{ data: companyModules }, roleData] = await Promise.all([
    supabase.from('company_modules').select('module_id, enabled, limits').eq('company_id', companyId),
    companyUser
      ? supabase.from('roles').select('code').eq('id', companyUser.role_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  if (!companyModules) return EMPTY_ENTITLEMENTS(companyId)

  const enabledModuleIds = companyModules.filter((m) => m.enabled).map((m) => m.module_id)
  const { data: moduleRows } =
    enabledModuleIds.length > 0
      ? await supabase.from('modules').select('id, code').in('id', enabledModuleIds)
      : { data: [] }

  const moduleCodeById = new Map((moduleRows ?? []).map((m) => [m.id, m.code as ModuleCode]))
  const modules = new Set<ModuleCode>()
  const limits: Partial<Record<ModuleCode, Record<string, unknown>>> = {}
  for (const row of companyModules) {
    if (!row.enabled) continue
    const code = moduleCodeById.get(row.module_id)
    if (!code) continue
    modules.add(code)
    limits[code] = (row.limits as Record<string, unknown>) ?? {}
  }

  const permissions = new Set<string>()
  const roleCode = roleData.data?.code ?? null

  if (companyUser) {
    const { data: rolePermissions } = await supabase
      .from('role_permissions')
      .select('permission_id')
      .eq('role_id', companyUser.role_id)
    const permissionIds = (rolePermissions ?? []).map((rp) => rp.permission_id)
    if (permissionIds.length > 0) {
      const { data: permissionRows } = await supabase
        .from('permissions')
        .select('key')
        .in('id', permissionIds)
      for (const p of permissionRows ?? []) permissions.add(p.key)
    }
  }

  return { companyId, modules, permissions, roleCode, limits }
}

export function hasModule(entitlements: Entitlements, module: ModuleCode): boolean {
  return entitlements.modules.has(module)
}

export function hasPermission(entitlements: Entitlements, permissionKey: string): boolean {
  return entitlements.permissions.has(permissionKey)
}
