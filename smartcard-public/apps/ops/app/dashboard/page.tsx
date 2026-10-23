import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'
import { resolveEntitlements, hasModule } from '@reymen/entitlements'
import { getCurrentCompanyUser } from '../../lib/current-company-user'
import { OpsNav } from '../../components/OpsNav'

const MODULE_LABELS: Record<string, string> = {
  smartcard: 'SmartCard',
  realty: 'Realty',
  food: 'Food',
  retail: 'Retail',
  care: 'Care',
}

// Dashboard mínimo de Fase 1 (REYMEN_OPS_PLAN.md, checklist de aceptación):
// resuelve company_id + entitlements server-side, muestra la empresa activa
// y qué módulos tiene habilitados. Los dashboards reales por vertical
// (KPIs, gráficas -- secciones 20/48/69 del prompt maestro) llegan en las
// fases siguientes, cuando exista contenido de negocio real que mostrar.
export default async function DashboardPage() {
  const user = await getCurrentCompanyUser()
  if (!user) redirect('/no-access')

  const supabase = await createServerSupabaseClient()
  const entitlements = await resolveEntitlements(supabase, user.companyId)

  return (
    <main className="mx-auto max-w-3xl p-8">
      <OpsNav user={user} entitlements={entitlements} />

      <h1 className="text-2xl font-semibold">Hola, {user.companyName}</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Rol: {user.roleCode} -- sesión: {user.email}
      </p>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">Módulos activos</h2>
        {entitlements.modules.size === 0 ? (
          <p className="rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
            Esta empresa todavía no tiene ningún módulo habilitado. Contacta a REYMEN para activar
            un plan.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
            {[...entitlements.modules].map((m) => (
              <li key={m} className="px-3 py-2">
                {MODULE_LABELS[m] ?? m}
              </li>
            ))}
          </ul>
        )}
      </section>

      {hasModule(entitlements, 'smartcard') && (
        <p className="mt-6 text-sm text-neutral-400">
          El panel de SmartCard dentro de REYMEN Ops llega en la Fase 2.
        </p>
      )}
    </main>
  )
}
