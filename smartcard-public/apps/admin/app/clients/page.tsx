import Link from 'next/link'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../lib/current-admin'
import { AdminHeader } from '../../components/AdminHeader'

// Caracteres que rompen la sintaxis del filtro .or() de PostgREST si van
// literales dentro del término de búsqueda (paréntesis y comas separan
// condiciones). Se quitan en vez de escaparse -- para un cuadro de búsqueda
// de nombre/correo/negocio no hace falta soportarlos.
function sanitizeSearchTerm(raw: string) {
  return raw.replace(/[,()%]/g, '').trim()
}

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; deleted?: string }>
}) {
  const { q, deleted } = await searchParams
  const admin = await getCurrentAdmin()
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('clients')
    .select('id, name, business_name, email, phone, status, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const term = q ? sanitizeSearchTerm(q) : ''
  if (term) {
    query = query.or(`name.ilike.%${term}%,business_name.ilike.%${term}%,email.ilike.%${term}%`)
  }

  const { data: clients, error } = await query

  const canCreate = admin?.role === 'SUPERADMIN' || admin?.role === 'ADMIN'

  return (
    <main className="mx-auto max-w-4xl p-8">
      <AdminHeader />

      {deleted === '1' && (
        <p className="mb-4 rounded-md bg-neutral-100 px-3 py-2 text-sm text-neutral-600">
          Cliente dado de baja.
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Clientes</h1>
        {canCreate && (
          <Link
            href="/clients/new"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Nuevo cliente
          </Link>
        )}
      </div>

      <form method="get" className="mb-6 flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Buscar por nombre, negocio o correo..."
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
            href="/clients"
            className="flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
          >
            Limpiar
          </Link>
        )}
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los clientes: {error.message}
        </p>
      )}

      {!error && clients?.length === 0 && (
        <p className="text-sm text-neutral-500">
          {q ? (
            `Sin resultados para "${q}".`
          ) : (
            <>
              Todavía no hay clientes.{' '}
              {canCreate && (
                <Link href="/clients/new" className="underline">
                  Da de alta el primero.
                </Link>
              )}
            </>
          )}
        </p>
      )}

      {clients && clients.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Negocio</th>
                <th className="px-3 py-2 font-medium">Contacto</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/clients/${client.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {client.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{client.business_name ?? '—'}</td>
                  <td className="px-3 py-2 text-neutral-600">
                    {client.email ?? client.phone ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        client.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-neutral-200 text-neutral-600'
                      }`}
                    >
                      {client.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                    </span>
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
