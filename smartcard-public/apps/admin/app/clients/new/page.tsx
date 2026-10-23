import { createClientAction } from './actions'
import { AdminHeader } from '../../../components/AdminHeader'

const ERROR_MESSAGES: Record<string, string> = {
  missing_name: 'El nombre es obligatorio.',
  save_failed: 'No se pudo guardar el cliente. Intenta de nuevo.',
  forbidden: 'No tienes permiso para crear clientes.',
}

export default async function NewClientPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  return (
    <main className="mx-auto max-w-lg p-8">
      <AdminHeader />
      <h1 className="mb-6 text-xl font-semibold">Nuevo cliente</h1>

      {message && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {message}
        </p>
      )}

      <form action={createClientAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium">
            Nombre <span className="text-red-600">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="business_name" className="text-sm font-medium">
            Nombre del negocio
          </label>
          <input
            id="business_name"
            name="business_name"
            type="text"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
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

        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="text-sm font-medium">
            Notas internas
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <p className="text-xs text-neutral-400">
            Nunca se muestra en ningún perfil ni endpoint público.
          </p>
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Guardar cliente
        </button>
      </form>
    </main>
  )
}
