import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@reymen/database'
import { resolveEntitlements, hasModule, hasPermission } from '@reymen/entitlements'
import { getCurrentCompanyUser } from '../../lib/current-company-user'
import { OpsNav } from '../../components/OpsNav'
import { EditCardModal } from './EditCardModal'
import { updateCardDestinationAction } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Faltan campos obligatorios.',
  card_needs_profile: 'Ese destino necesita que selecciones un perfil digital.',
  card_no_profile_allowed: 'Ese destino no debe tener un perfil digital asociado.',
  card_needs_url: 'Ese destino necesita una URL.',
  card_no_url_allowed: 'Ese destino no debe tener URL.',
  link_url_invalid: 'La URL no es válida -- debe empezar con http:// o https://.',
  forbidden: 'Tu rol no tiene permiso para editar tarjetas. Pide a un admin/owner de tu empresa que lo haga.',
  save_failed: 'No se pudo guardar el cambio. Intenta de nuevo.',
}

const DESTINATION_LABELS: Record<string, string> = {
  PROFILE: 'Perfil digital',
}

// REYMEN Ops -- Fase 2 (SmartCard autoservicio, REYMEN_OPS_PLAN.md). Esta es
// la pantalla que el dashboard de Fase 1 todavía anunciaba como pendiente
// ("El panel de SmartCard dentro de REYMEN Ops llega en la Fase 2."):
// tarjetas de la empresa + su analítica + editar a dónde apuntan + su
// perfil digital. Igual que el resto de apps/ops, resuelve company_id +
// entitlements server-side y confía en RLS (20261006120001) para que un
// usuario nunca vea una tarjeta que no es de su empresa, no solo en que
// esta consulta la filtre bien.
export default async function SmartcardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { error, saved } = await searchParams
  const user = await getCurrentCompanyUser()
  if (!user) redirect('/no-access')

  const supabase = await createServerSupabaseClient()
  const entitlements = await resolveEntitlements(supabase, user.companyId)

  if (!hasModule(entitlements, 'smartcard')) redirect('/dashboard')

  const canEdit = hasPermission(entitlements, 'smartcard.manage')
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  // Sin filtro explícito de company -- RLS (cards_company_select) ya
  // garantiza que esto solo trae las tarjetas de clients cuyo company_id es
  // el de este usuario. Lo mismo aplica a profiles/events más abajo.
  const { data: cards } = await supabase
    .from('cards')
    .select('id, card_code, destination_type, destination_url, profile_id, status')
    .is('deleted_at', null)
    .order('card_code', { ascending: true })

  const { data: destinationTypes } = await supabase
    .from('destination_types')
    .select('code, label, requires_profile, requires_url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, slug, status')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const companyProfile = profiles && profiles.length > 0 ? profiles[0] : null

  const cardIds = (cards ?? []).map((c) => c.id)
  const { data: events } =
    cardIds.length > 0
      ? await supabase.from('events').select('card_id, occurred_at').in('card_id', cardIds)
      : { data: [] }

  // Conteo/última actividad por tarjeta hecho en JS, no con un agregado SQL
  // -- mismo criterio que ya documenta packages/entitlements/src/index.ts
  // (los tipos generados a mano de packages/database no tipan bien un
  // select anidado/agregado).
  const statsByCard = new Map<string, { count: number; lastAt: string | null }>()
  for (const ev of events ?? []) {
    if (!ev.card_id) continue
    const prev = statsByCard.get(ev.card_id) ?? { count: 0, lastAt: null }
    prev.count += 1
    if (!prev.lastAt || ev.occurred_at > prev.lastAt) prev.lastAt = ev.occurred_at
    statsByCard.set(ev.card_id, prev)
  }

  const totalCards = cards?.length ?? 0
  const totalEvents = events?.length ?? 0
  const avgPerCard = totalCards > 0 ? Math.round(totalEvents / totalCards) : 0

  return (
    <main className="mx-auto max-w-4xl p-8">
      <OpsNav user={user} entitlements={entitlements} />

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">SmartCard</h1>
      </div>

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

      <div className="mb-8 grid grid-cols-3 gap-4">
        <div className="rounded-md border border-neutral-200 p-4">
          <p className="text-2xl font-semibold">{totalCards}</p>
          <p className="text-sm text-neutral-500">Tarjetas</p>
        </div>
        <div className="rounded-md border border-neutral-200 p-4">
          <p className="text-2xl font-semibold">{totalEvents}</p>
          <p className="text-sm text-neutral-500">Eventos totales</p>
        </div>
        <div className="rounded-md border border-neutral-200 p-4">
          <p className="text-2xl font-semibold">{avgPerCard}</p>
          <p className="text-sm text-neutral-500">Promedio por tarjeta</p>
        </div>
      </div>

      <section className="mb-8 rounded-md border border-neutral-200 p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-700">Perfil digital</h2>
            {companyProfile ? (
              <p className="mt-1 text-sm text-neutral-500">
                {companyProfile.display_name} · /{companyProfile.slug} ·{' '}
                {companyProfile.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
              </p>
            ) : (
              <p className="mt-1 text-sm text-neutral-500">Todavía no has creado uno.</p>
            )}
          </div>
          {canEdit && (
            <Link
              href="/smartcard/profile"
              className="whitespace-nowrap rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100"
            >
              {companyProfile ? 'Editar perfil' : 'Crear perfil digital'}
            </Link>
          )}
        </div>
      </section>

      {!cards?.length && (
        <p className="text-sm text-neutral-500">
          Todavía no tienes tarjetas dadas de alta. Contacta a REYMEN para que te active una.
        </p>
      )}

      {!!cards?.length && (
        <div className="overflow-x-auto rounded-md border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-100 text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">Tarjeta</th>
                <th className="px-3 py-2 font-medium">Destino</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Eventos</th>
                <th className="px-3 py-2 font-medium">Última actividad</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {cards.map((card) => {
                const stats = statsByCard.get(card.id) ?? { count: 0, lastAt: null }
                return (
                  <tr key={card.id} className="hover:bg-neutral-50">
                    <td className="px-3 py-2 font-medium">{card.card_code ?? '—'}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {DESTINATION_LABELS[card.destination_type] ?? card.destination_type}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          card.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-neutral-200 text-neutral-600'
                        }`}
                      >
                        {card.status === 'ACTIVE' ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-neutral-600">{stats.count}</td>
                    <td className="px-3 py-2 text-neutral-600">
                      {stats.lastAt ? new Date(stats.lastAt).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <EditCardModal
                        card={card}
                        destinationTypes={destinationTypes ?? []}
                        companyProfile={companyProfile}
                        canEdit={canEdit}
                        action={updateCardDestinationAction}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
