import Link from 'next/link'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../lib/current-admin'
import { AdminHeader } from '../../components/AdminHeader'

function sanitizeSearchTerm(raw: string) {
  return raw.replace(/[,()%]/g, '').trim()
}

export default async function ProfilesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; client_id?: string }>
}) {
  const { q, client_id } = await searchParams
  const admin = await getCurrentAdmin()
  const supabase = await createServerSupabaseClient()

  let query = supabase
    .from('profiles')
    .select('id, slug, display_name, company, status, client_id, clients(name)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (client_id) {
    query = query.eq('client_id', client_id)
  }

  const term = q ? sanitizeSearchTerm(q) : ''
  if (term) {
    query = query.or(`display_name.ilike.%${term}%,slug.ilike.%${term}%,company.ilike.%${term}%`)
  }

  const { data: profiles, error } = await query

  let filteredClientName: string | null = null
  if (client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('name')
      .eq('id', client_id)
      .maybeSingle()
    filteredClientName = client?.name ?? null
  }

  const canCreate = admin?.role === 'SUPERADMIN' || admin?.role === 'ADMIN'

  return (
    <main className="mx-auto max-w-4xl p-8">
      <AdminHeader />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Perfiles</h1>
          {filteredClientName && (
            <p className="mt-1 text-sm text-neutral-500">
              Solo de <strong>{filteredClientName}</strong> --{' '}
              <Link href="/profiles" className="underline">
                ver todos
              </Link>
            </p>
          )}
        </div>
        {canCreate && (
          <Link
            href={client_id ? `/profiles/new?client_id=${client_id}` : '/profiles/new'}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            + Nuevo perfil
          </Link>
        )}
      </div>

      <form method="get" className="mb-6 flex gap-2">
        {client_id && <input type="hidden" name="client_id" value={client_id} />}
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Buscar por nombre, slug o negocio..."
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
            href={client_id ? `/profiles?client_id=${client_id}` : '/profiles'}
            className="flex items-center rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100"
          >
            Limpiar
          </Link>
        )}
      </form>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los perfiles: {error.message}
        </p>
      )}

      {!error && profiles?.length === 0 && (
        <p className="text-sm text-neutral-500">
          {q ? (
            `Sin resultados para "${q}".`
          ) : (
            <>
              Todavía no hay perfiles.{' '}
              {canCreate && (
                <Link
                  href={client_id ? `/profiles/new?client_id=${client_id}` : '/profiles/new'}
                  className="underline"
                >
                  Da de alta el primero.
                </Link>
              )}
            </>
          )}
        </p>
      )}

      {profiles && profiles.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Slug</th>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {profiles.map((profile) => (
                <tr key={profile.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <Link
                      href={`/profiles/${profile.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {profile.display_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-neutral-500">/{profile.slug}</td>
                  <td className="px-3 py-2 text-neutral-600">
                    {(profile.clients as unknown as { name: string } | null)?.name ?? '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        profile.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-neutral-200 text-neutral-600'
                      }`}
                    >
                      {profile.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
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
