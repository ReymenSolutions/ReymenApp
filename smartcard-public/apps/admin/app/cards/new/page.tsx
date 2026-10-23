import { createServerSupabaseClient } from '@reymen/database'
import { createCardAction } from './actions'
import { CardDestinationFields } from '../CardDestinationFields'
import { AdminHeader } from '../../../components/AdminHeader'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'El cliente y el tipo de destino son obligatorios.',
  card_needs_profile: 'Ese tipo de destino necesita que elijas un perfil digital.',
  card_no_profile_allowed: 'Ese tipo de destino no debe tener un perfil asociado.',
  card_needs_url: 'Ese tipo de destino necesita una URL de destino.',
  card_no_url_allowed: 'Ese tipo de destino no debe tener una URL de destino.',
  link_url_invalid: 'La URL de destino debe empezar con http:// o https://',
  save_failed: 'No se pudo guardar la tarjeta. Intenta de nuevo.',
  forbidden: 'No tienes permiso para crear tarjetas.',
}

export default async function NewCardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; client_id?: string }>
}) {
  const { error, client_id } = await searchParams
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  const supabase = await createServerSupabaseClient()

  const [{ data: clients }, { data: destinationTypes }, { data: profiles }] = await Promise.all([
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
    supabase
      .from('destination_types')
      .select('code, label, requires_profile, requires_url')
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('profiles')
      .select('id, display_name, slug, client_id, clients(name)')
      .is('deleted_at', null)
      .order('display_name'),
  ])

  const profileOptions = (profiles ?? []).map((p) => ({
    id: p.id,
    display_name: p.display_name,
    slug: p.slug,
    client_name: (p.clients as unknown as { name: string } | null)?.name ?? null,
  }))

  return (
    <main className="mx-auto max-w-lg p-8">
      <AdminHeader />
      <h1 className="mb-6 text-xl font-semibold">Nueva tarjeta</h1>

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

      <p className="mb-4 rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-500">
        El código de la tarjeta (REY-000001, etc.) se genera automáticamente al guardar -- no se
        pide aquí.
      </p>

      <form action={createCardAction} className="flex flex-col gap-4">
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

        <CardDestinationFields
          destinationTypes={destinationTypes ?? []}
          profiles={profileOptions}
          defaultDestinationType=""
          defaultProfileId={null}
          defaultDestinationUrl={null}
          disabled={false}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="text-sm font-medium">
            Notas internas
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
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
            <option value="ACTIVE">Activa</option>
            <option value="INACTIVE">Inactiva</option>
          </select>
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Guardar tarjeta
        </button>
      </form>
    </main>
  )
}
