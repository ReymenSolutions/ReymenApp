import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { getPublicSiteUrl } from '../../../lib/public-site-url'
import { AdminHeader } from '../../../components/AdminHeader'
import { CardDestinationFields } from '../CardDestinationFields'
import { updateCardAction, softDeleteCardAction, reactivateCardAction } from './actions'
import { buildCardQrTargetUrl } from '@reymen/lib'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'El cliente y el tipo de destino son obligatorios.',
  card_needs_profile: 'Ese tipo de destino necesita que elijas un perfil digital.',
  card_no_profile_allowed: 'Ese tipo de destino no debe tener un perfil asociado.',
  card_needs_url: 'Ese tipo de destino necesita una URL de destino.',
  card_no_url_allowed: 'Ese tipo de destino no debe tener una URL de destino.',
  link_url_invalid: 'La URL de destino debe empezar con http:// o https://',
  save_failed: 'No se pudo guardar el cambio. Intenta de nuevo.',
  forbidden: 'No tienes permiso para hacer eso.',
}

export default async function CardDetailPage({
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

  const { data: card } = await supabase.from('cards').select('*').eq('id', id).maybeSingle()
  if (!card) notFound()

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

  const canEdit = admin?.role === 'SUPERADMIN' || admin?.role === 'ADMIN'
  const canDelete = admin?.role === 'SUPERADMIN'
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  return (
    <main className="mx-auto max-w-lg p-8">
      <AdminHeader />

      <div className="mb-4 flex items-center justify-between">
        <Link href="/cards" className="text-sm text-neutral-500 hover:underline">
          ← Volver a tarjetas
        </Link>
        <Link href={`/analytics?card_id=${card.id}`} className="text-sm underline">
          Ver analítica de esta tarjeta
        </Link>
      </div>

      {card.deleted_at && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <p>Esta tarjeta está dada de baja desde {new Date(card.deleted_at).toLocaleString('es-MX')}.</p>
          {canDelete && (
            <form action={reactivateCardAction} className="mt-2">
              <input type="hidden" name="id" value={card.id} />
              <button type="submit" className="text-sm font-medium underline">
                Reactivar tarjeta
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

      <h1 className="mb-1 text-xl font-semibold">{card.card_code ?? '(sin código)'}</h1>
      <p className="mb-4 text-sm text-neutral-500">
        El código no se puede cambiar -- lo generó Postgres al crear la tarjeta.
      </p>

      {card.card_code && (
        <div className="mb-6 flex items-start gap-4 rounded-md border border-neutral-200 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/cards/${card.id}/qr`}
            alt={`Código QR de la tarjeta ${card.card_code}`}
            width={112}
            height={112}
            className="shrink-0 rounded-md border border-neutral-100"
          />
          <div className="flex flex-col gap-2 text-sm">
            <p className="text-neutral-500">
              Apunta a{' '}
              <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">
                {buildCardQrTargetUrl(getPublicSiteUrl(), card.card_code)}
              </code>
            </p>
            <a
              href={`/cards/${card.id}/qr?download=1`}
              className="inline-block w-fit text-sm font-medium underline"
            >
              Descargar QR (PNG)
            </a>
          </div>
        </div>
      )}

      <form action={updateCardAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={card.id} />

        <div className="flex flex-col gap-1">
          <label htmlFor="client_id" className="text-sm font-medium">
            Cliente <span className="text-red-600">*</span>
          </label>
          <select
            id="client_id"
            name="client_id"
            required
            disabled={!canEdit}
            defaultValue={card.client_id}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
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
          defaultDestinationType={card.destination_type}
          defaultProfileId={card.profile_id}
          defaultDestinationUrl={card.destination_url}
          disabled={!canEdit}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="notes" className="text-sm font-medium">
            Notas internas
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            disabled={!canEdit}
            defaultValue={card.notes ?? ''}
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
            defaultValue={card.status}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            <option value="ACTIVE">Activa</option>
            <option value="INACTIVE">Inactiva</option>
          </select>
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

      {canDelete && !card.deleted_at && (
        <form action={softDeleteCardAction} className="mt-8 border-t border-neutral-200 pt-4">
          <input type="hidden" name="id" value={card.id} />
          <button type="submit" className="text-sm text-red-600 underline">
            Dar de baja esta tarjeta
          </button>
        </form>
      )}
    </main>
  )
}
