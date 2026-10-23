import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { AdminHeader } from '../../../components/AdminHeader'
import { updateClientAction, softDeleteClientAction, reactivateClientAction } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_name: 'El nombre es obligatorio.',
  save_failed: 'No se pudo guardar el cambio. Intenta de nuevo.',
  forbidden: 'No tienes permiso para hacer eso.',
}

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { id } = await params
  const { error, saved } = await searchParams
  const admin = await getCurrentAdmin()
  const supabase = await createServerSupabaseClient()

  const { data: client } = await supabase.from('clients').select('*').eq('id', id).maybeSingle()

  if (!client) notFound()

  // profiles/cards todavía no tienen pantalla propia (fases siguientes) --
  // aquí solo se listan de solo lectura para que ya se vea qué tiene cada
  // cliente en cuanto esas pantallas existan.
  const [{ data: profiles }, { data: cards }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, slug, display_name, status')
      .eq('client_id', id)
      .is('deleted_at', null),
    supabase
      .from('cards')
      .select('id, card_code, destination_type, status')
      .eq('client_id', id)
      .is('deleted_at', null),
  ])

  const canEdit = admin?.role === 'SUPERADMIN' || admin?.role === 'ADMIN'
  const canDelete = admin?.role === 'SUPERADMIN'
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  return (
    <main className="mx-auto max-w-2xl p-8">
      <AdminHeader />

      <Link href="/clients" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Volver a clientes
      </Link>

      {client.deleted_at && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <p>
            Este cliente está dado de baja desde{' '}
            {new Date(client.deleted_at).toLocaleString('es-MX')}.
          </p>
          {canDelete && (
            <form action={reactivateClientAction} className="mt-2">
              <input type="hidden" name="id" value={client.id} />
              <button type="submit" className="text-sm font-medium underline">
                Reactivar cliente
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

      <h1 className="mb-6 text-xl font-semibold">{client.name}</h1>

      <form action={updateClientAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={client.id} />

        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium">
            Nombre <span className="text-red-600">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            disabled={!canEdit}
            defaultValue={client.name}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
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
            disabled={!canEdit}
            defaultValue={client.business_name ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
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
            disabled={!canEdit}
            defaultValue={client.email ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
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
            disabled={!canEdit}
            defaultValue={client.phone ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium">
            Estado
          </label>
          <select
            id="status"
            name="status"
            disabled={!canEdit}
            defaultValue={client.status}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
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
            disabled={!canEdit}
            defaultValue={client.notes ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        {canEdit && (
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Guardar cambios
          </button>
        )}
      </form>

      <section className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-500">
            Perfiles ({profiles?.length ?? 0})
          </h2>
          {canEdit && (
            <Link href={`/profiles/new?client_id=${client.id}`} className="text-sm underline">
              + Nuevo perfil
            </Link>
          )}
        </div>
        {!profiles?.length && (
          <p className="text-sm text-neutral-400">Sin perfiles todavía.</p>
        )}
        {!!profiles?.length && (
          <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
            {profiles.map((profile) => (
              <li key={profile.id} className="flex items-center justify-between px-3 py-2">
                <Link href={`/profiles/${profile.id}`} className="font-medium hover:underline">
                  {profile.display_name}
                </Link>
                <span className="text-neutral-400">/{profile.slug}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-500">
            Tarjetas ({cards?.length ?? 0})
          </h2>
          {canEdit && (
            <Link href={`/cards/new?client_id=${client.id}`} className="text-sm underline">
              + Nueva tarjeta
            </Link>
          )}
        </div>
        {!cards?.length && <p className="text-sm text-neutral-400">Sin tarjetas todavía.</p>}
        {!!cards?.length && (
          <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
            {cards.map((card) => (
              <li key={card.id} className="flex items-center justify-between px-3 py-2">
                <Link href={`/cards/${card.id}`} className="font-medium hover:underline">
                  {card.card_code}
                </Link>
                <span className="text-neutral-400">{card.destination_type}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canDelete && !client.deleted_at && (
        <form action={softDeleteClientAction} className="mt-8 border-t border-neutral-200 pt-4">
          <input type="hidden" name="id" value={client.id} />
          <button type="submit" className="text-sm text-red-600 underline">
            Dar de baja este cliente
          </button>
        </form>
      )}
    </main>
  )
}
