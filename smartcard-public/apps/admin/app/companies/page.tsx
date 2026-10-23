import Link from 'next/link'
import { createServerSupabaseClient } from '@reymen/database'
import { AdminHeader } from '../../components/AdminHeader'

// Pantalla mínima de companies (REYMEN Ops, Fase 1) -- hasta ahora dar de
// alta y editar una company se hacía a mano por SQL Editor (ver
// FASE1_OPS_CORE.md / BLOQUE1_PLAN_LIMITS.md), incluido el nuevo campo
// external_org_id (vínculo SSO de SmartCard con Reymen-AI-OPS-Platform).
// Esta pantalla existe primero para eso -- no reemplaza todavía el flujo de
// alta completo (crear company + company_users + company_modules en un solo
// paso sigue pendiente, ver REYMEN_OPS_REVISION_EXPERTA.md), solo cubre
// ver/editar una company ya existente.
function sanitizeSearchTerm(raw: string) {
  return raw.replace(/[,()%]/g, '').trim()
}

const STATUS_LABELS: Record<string, string> = {
  trial: 'Prueba',
  active: 'Activa',
  past_due: 'Pago vencido',
  suspended: 'Suspendida',
  cancelled: 'Cancelada',
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('companies')
    .select('id, name, slug, status, industry, external_org_id, created_at')
    .order('created_at', { ascending: false })

  const term = q ? sanitizeSearchTerm(q) : ''
  if (term) {
    query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`)
  }

  const { data: companies, error } = await query

  return (
    <main className="mx-auto max-w-4xl p-8">
      <AdminHeader />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Empresas (REYMEN Ops)</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Empresas del sistema multi-tenant de Ops (owner/admin/manager/staff/agent, planes,
            módulos). El alta completa (company + primer usuario + módulos) sigue siendo manual
            por SQL Editor por ahora -- ver <code>FASE1_OPS_CORE.md</code>.
          </p>
        </div>
      </div>

      <form method="get" className="mb-6 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Buscar por nombre o slug..."
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <button
          type="submit"
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100"
        >
          Buscar
        </button>
        {q && (
          <Link
            href="/companies"
            className="flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
          >
            Limpiar
          </Link>
        )}
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar las empresas: {error.message}
        </p>
      )}

      {!error && companies?.length === 0 && (
        <p className="text-sm text-neutral-500">
          {q ? `Sin resultados para "${q}".` : 'Todavía no hay empresas dadas de alta.'}
        </p>
      )}

      {companies && companies.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Industria</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">SmartCard SSO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {companies.map((company) => (
                <tr key={company.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/companies/${company.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {company.name}
                    </Link>
                    <p className="text-xs text-neutral-400">{company.slug}</p>
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{company.industry ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        company.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-neutral-200 text-neutral-600'
                      }`}
                    >
                      {STATUS_LABELS[company.status] ?? company.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-neutral-600">
                    {company.external_org_id ? (
                      <span className="text-green-700">Vinculada</span>
                    ) : (
                      <span className="text-neutral-400">Sin vincular</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
