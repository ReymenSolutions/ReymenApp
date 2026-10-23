import { createServerSupabaseClient } from '@reymen/database'
import { createProfileAction } from './actions'
import { AdminHeader } from '../../../components/AdminHeader'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'El cliente, el slug y el nombre a mostrar son obligatorios.',
  slug_taken: 'Ese slug ya lo está usando otro perfil activo. Elige uno distinto.',
  slug_invalid:
    'Ese slug no es válido: usa solo minúsculas, números y guiones simples (ej. "juan-perez"), y confirma que no sea una palabra reservada (admin, login, api, etc.).',
  save_failed: 'No se pudo guardar el perfil. Intenta de nuevo.',
  forbidden: 'No tienes permiso para crear perfiles.',
}

export default async function NewProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; client_id?: string }>
}) {
  const { error, client_id } = await searchParams
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  const supabase = await createServerSupabaseClient()

  const [{ data: clients }, { data: themes }] = await Promise.all([
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('themes').select('id, name').eq('is_active', true).order('name'),
  ])

  return (
    <main className="mx-auto max-w-lg p-8">
      <AdminHeader />
      <h1 className="mb-6 text-xl font-semibold">Nuevo perfil</h1>

      {message && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {message}
        </p>
      )}

      {!clients?.length && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Todavía no hay ningún cliente. Da de alta uno primero desde{' '}
          <a href="/clients/new" className="underline">
            Clientes
          </a>
          .
        </p>
      )}

      <form action={createProfileAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="client_id" className="text-sm font-medium">
            Cliente <span className="text-red-600">*</span>
          </label>
          <select
            id="client_id"
            name="client_id"
            required
            defaultValue={client_id ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          >
            <option value="" disabled>
              Selecciona un cliente...
            </option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="slug" className="text-sm font-medium">
            Slug <span className="text-red-600">*</span>
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            placeholder="juan-perez"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <p className="text-xs text-neutral-400">
            Así se verá la URL pública: link.reymensolutions.mx/[slug]. Solo minúsculas, números y
            guiones.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="display_name" className="text-sm font-medium">
            Nombre a mostrar <span className="text-red-600">*</span>
          </label>
          <input
            id="display_name"
            name="display_name"
            type="text"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="first_name" className="text-sm font-medium">
              Nombre(s)
            </label>
            <input
              id="first_name"
              name="first_name"
              type="text"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="last_name" className="text-sm font-medium">
              Apellido(s)
            </label>
            <input
              id="last_name"
              name="last_name"
              type="text"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="job_title" className="text-sm font-medium">
            Puesto
          </label>
          <input
            id="job_title"
            name="job_title"
            type="text"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="company" className="text-sm font-medium">
            Empresa
          </label>
          <input
            id="company"
            name="company"
            type="text"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="bio" className="text-sm font-medium">
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={2}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="text-sm font-medium">
              Teléfono
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="whatsapp" className="text-sm font-medium">
              WhatsApp
            </label>
            <input
              id="whatsapp"
              name="whatsapp"
              type="tel"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="website" className="text-sm font-medium">
            Sitio web
          </label>
          <input
            id="website"
            name="website"
            type="url"
            placeholder="https://..."
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="theme_id" className="text-sm font-medium">
            Tema visual
          </label>
          <select
            id="theme_id"
            name="theme_id"
            defaultValue=""
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          >
            <option value="">Sin tema (usa el default)</option>
            {themes?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium">
            Estado
          </label>
          <select
            id="status"
            name="status"
            defaultValue="ACTIVE"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          >
            <option value="ACTIVE">Activo</option>
            <option value="INACTIVE">Inactivo</option>
          </select>
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Guardar perfil
        </button>
      </form>
    </main>
  )
}
