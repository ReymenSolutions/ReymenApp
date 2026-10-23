import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { AdminHeader } from '../../../components/AdminHeader'
import { inviteAdminAction } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'El nombre, el correo y el rol son obligatorios.',
  invalid_email: 'Ese correo no parece válido.',
  email_already_registered:
    'Ya existe una cuenta con ese correo. Si necesitas reinvitarla, primero bórrala desde Supabase Studio (Authentication → Users) -- ver AUTH.md sección 9, punto 6.',
  invite_failed: 'No se pudo enviar la invitación. Intenta de nuevo.',
  forbidden: 'No tienes permiso para hacer eso.',
}

export default async function NewUserPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const admin = await getCurrentAdmin()

  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/users')
  }

  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  return (
    <main className="mx-auto max-w-lg p-8">
      <AdminHeader />

      <Link href="/users" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Volver a usuarios
      </Link>

      {message && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {message}
        </p>
      )}

      <h1 className="mb-1 text-xl font-semibold">Invitar administrador</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Se manda un correo de invitación (mismo mecanismo que el primer SUPERADMIN, ver AUTH.md).
        La persona define su propia contraseña al abrir el link.
      </p>

      <form action={inviteAdminAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="full_name" className="text-sm font-medium">
            Nombre completo <span className="text-red-600">*</span>
          </label>
          <input
            id="full_name"
            name="full_name"
            type="text"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">
            Correo <span className="text-red-600">*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
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
            defaultValue="ADMIN"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          >
            <option value="SUPERADMIN">SUPERADMIN -- acceso total, incluida baja de registros y gestión de usuarios</option>
            <option value="ADMIN">ADMIN -- crea y edita, no borra ni gestiona usuarios</option>
            <option value="VIEWER">VIEWER -- solo lectura</option>
          </select>
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Enviar invitación
        </button>
      </form>
    </main>
  )
}
