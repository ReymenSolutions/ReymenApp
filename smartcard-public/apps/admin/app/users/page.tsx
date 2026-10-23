import Link from 'next/link'
import { createServerSupabaseClient, createAdminClient } from '@reymen/database'
import { getCurrentAdmin } from '../../lib/current-admin'
import { AdminHeader } from '../../components/AdminHeader'

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: 'SUPERADMIN',
  ADMIN: 'ADMIN',
  VIEWER: 'VIEWER',
}

const ROLE_BADGE: Record<string, string> = {
  SUPERADMIN: 'bg-purple-100 text-purple-700',
  ADMIN: 'bg-blue-100 text-blue-700',
  VIEWER: 'bg-neutral-200 text-neutral-600',
}

export default async function UsersPage() {
  const admin = await getCurrentAdmin()

  if (!admin || admin.role !== 'SUPERADMIN') {
    return (
      <main className="mx-auto max-w-4xl p-8">
        <AdminHeader />
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Solo un SUPERADMIN puede ver la gestión de usuarios administrativos.
        </p>
      </main>
    )
  }

  const supabase = await createServerSupabaseClient()
  const { data: profiles, error } = await supabase
    .from('admin_profiles')
    .select('id, full_name, role, is_active, created_at')
    .order('created_at', { ascending: true })

  // admin_profiles no tiene columna de correo (vive en auth.users, en otro
  // schema, que PostgREST no expone) -- por eso, y solo para esta pantalla,
  // se usa el cliente con service_role (packages/database/src/admin.ts) para
  // pedirle el listado a Supabase Auth y cruzarlo por id. Es exactamente el
  // mismo mecanismo que ya usa scripts/create-superadmin.mjs para invitar,
  // solo que aquí es de lectura.
  const emailById = new Map<string, string>()
  try {
    const adminClient = createAdminClient()
    const { data: authUsers } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
    for (const u of authUsers?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email)
    }
  } catch (e) {
    console.error('[users] No se pudo obtener el listado de auth.users:', (e as Error).message)
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <AdminHeader />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Usuarios administrativos</h1>
        <Link
          href="/users/new"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + Invitar administrador
        </Link>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudieron cargar los usuarios: {error.message}
        </p>
      )}

      {!error && profiles && profiles.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Nombre</th>
                <th className="px-3 py-2 font-medium">Correo</th>
                <th className="px-3 py-2 font-medium">Rol</th>
                <th className="px-3 py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {profiles.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <Link href={`/users/${p.id}`} className="font-medium hover:underline">
                      {p.full_name}
                    </Link>
                    {p.id === admin.id && (
                      <span className="ml-2 text-xs text-neutral-400">(tú)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{emailById.get(p.id) ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[p.role]}`}
                    >
                      {ROLE_LABELS[p.role] ?? p.role}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-neutral-200 text-neutral-600'
                      }`}
                    >
                      {p.is_active ? 'Activo' : 'Desactivado'}
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
