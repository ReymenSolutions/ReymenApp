import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerSupabaseClient, createAdminClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { AdminHeader } from '../../../components/AdminHeader'
import { updateAdminAction, deactivateAdminAction, reactivateAdminAction } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'El nombre y el rol son obligatorios.',
  self_change_forbidden:
    'No puedes cambiar tu propio rol ni desactivar tu propia cuenta -- para eso necesitas a otro SUPERADMIN. Es a propósito, para que nadie se quede sin acceso por accidente.',
  save_failed: 'No se pudo guardar el cambio. Intenta de nuevo.',
  forbidden: 'No tienes permiso para hacer eso.',
}

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { id } = await params
  const { error, saved } = await searchParams
  const admin = await getCurrentAdmin()

  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/users')
  }

  const supabase = await createServerSupabaseClient()
  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('id, full_name, role, is_active, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!profile) notFound()

  let email: string | null = null
  try {
    const adminClient = createAdminClient()
    const { data: authUser } = await adminClient.auth.admin.getUserById(id)
    email = authUser?.user?.email ?? null
  } catch (e) {
    console.error('[users/[id]] No se pudo obtener el correo:', (e as Error).message)
  }

  const isSelf = profile.id === admin.id
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  return (
    <main className="mx-auto max-w-lg p-8">
      <AdminHeader />

      <Link href="/users" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Volver a usuarios
      </Link>

      {!profile.is_active && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <p>Esta cuenta está desactivada. No puede iniciar sesión.</p>
          {!isSelf && (
            <form action={reactivateAdminAction} className="mt-2">
              <input type="hidden" name="id" value={profile.id} />
              <button type="submit" className="text-sm font-medium underline">
                Reactivar cuenta
              </button>
            </form>
          )}
        </div>
      )}

      {saved === '1' && (
        <p className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Cambios guardados.
        </p>
      )}
      {message && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {message}
        </p>
      )}

      <h1 className="mb-1 text-xl font-semibold">
        {profile.full_name} {isSelf && <span className="text-sm text-neutral-400">(tú)</span>}
      </h1>
      <p className="mb-6 text-sm text-neutral-500">{email ?? '(correo no disponible)'}</p>

      {isSelf && (
        <p className="mb-4 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
          No puedes cambiar tu propio rol ni desactivar tu propia cuenta desde aquí -- pídele a
          otro SUPERADMIN que lo haga.
        </p>
      )}

      <form action={updateAdminAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={profile.id} />

        <div className="flex flex-col gap-1">
          <label htmlFor="full_name" className="text-sm font-medium">
            Nombre completo <span className="text-red-600">*</span>
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            defaultValue={profile.full_name}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="role" className="text-sm font-medium">
            Rol <span className="text-red-600">*</span>
          </label>
          <select
            id="role"
            name="role"
            disabled={isSelf}
            defaultValue={profile.role}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            <option value="SUPERADMIN">SUPERADMIN</option>
            <option value="ADMIN">ADMIN</option>
            <option value="VIEWER">VIEWER</option>
          </select>
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Guardar cambios
        </button>
      </form>

      {profile.is_active && !isSelf && (
        <form action={deactivateAdminAction} className="mt-8 border-t border-neutral-200 pt-4">
          <input type="hidden" name="id" value={profile.id} />
          <button type="submit" className="text-sm text-red-600 underline">
            Desactivar esta cuenta
          </button>
        </form>
      )}
    </main>
  )
}
