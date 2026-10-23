import Link from 'next/link'
import { createServerSupabaseClient } from '@reymen/database'
import { AdminHeader } from '../../components/AdminHeader'

// -----------------------------------------------------------------------
// Fase 8 -- analítica (/analytics). Puramente de lectura: `events` ya
// existe desde Fase 2 y se llena vía log_event() (SECURITY DEFINER, la
// misma función que usará apps/public cuando esas rutas dejen de ser un
// scaffold -- ver FASE7.md sección 4). Esta pantalla no escribe nada, así
// que no hay acciones, no hay db-errors.ts nuevo y no hay auditoría: la
// policy `events_select` de Fase 2 ya permite a los 3 roles (SUPERADMIN,
// ADMIN, VIEWER) leer esta tabla por igual -- por eso, a diferencia de
// clientes/perfiles/tarjetas, aquí no hay ninguna rama canEdit/canDelete.
//
// is_bot se excluye siempre de las métricas (comentario original de la
// columna en 20260905120008_events.sql: "se excluye de las métricas que
// ve el cliente"), y no se toca la decisión de privacidad de esa tabla
// (sin IP) -- ver DATABASE.md sección de events.
// -----------------------------------------------------------------------

const EVENT_TYPE_LABELS: Record<string, string> = {
  profile_view: 'Vista de perfil',
  nfc_scan: 'Escaneo NFC',
  qr_scan: 'Escaneo QR',
  whatsapp_click: 'Clic en WhatsApp',
  call_click: 'Clic en llamar',
  email_click: 'Clic en correo',
  instagram_click: 'Clic en Instagram',
  facebook_click: 'Clic en Facebook',
  linkedin_click: 'Clic en LinkedIn',
  maps_click: 'Clic en mapa',
  website_click: 'Clic en sitio web',
  save_contact: 'Guardar contacto',
  custom_link_click: 'Clic en enlace',
  google_reviews_redirect: 'Redirección a Google Reviews',
  external_redirect: 'Redirección externa',
  // Fase 17: error de React sin capturar en el navegador de un visitante --
  // ver apps/public/app/error.tsx y api/client-error/route.ts.
  client_error: 'Error técnico (cliente)',
}

const SOURCE_LABELS: Record<string, string> = {
  NFC: 'NFC',
  QR: 'QR',
  DIRECT: 'Directo',
}

const DAY_OPTIONS = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
  { value: 'all', label: 'Todo' },
]

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string; card_id?: string; days?: string }>
}) {
  const { client_id, card_id, days } = await searchParams
  const supabase = await createServerSupabaseClient()

  const daysParam = days ?? '30'
  const cutoffIso =
    daysParam === 'all' ? null : new Date(Date.now() - Number(daysParam || 30) * 86400000).toISOString()

  // Catálogos para los filtros y para "traducir" ids a nombres legibles --
  // se traen completos porque, a esta escala (negocio chico/mediano por
  // cliente), es más simple y más difícil de romper que un embed anidado
  // events -> cards -> clients con el tipo Database escrito a mano
  // (Relationships: [] en packages/database/src/types.ts, igual que en
  // Fase 7 con cards -> profiles -> clients).
  const [{ data: clients }, { data: cards }, { data: profiles }] = await Promise.all([
    supabase.from('clients').select('id, name').is('deleted_at', null).order('name'),
    supabase.from('cards').select('id, card_code, client_id').is('deleted_at', null),
    supabase.from('profiles').select('id, display_name, slug, client_id').is('deleted_at', null),
  ])

  const cardMap = new Map((cards ?? []).map((c) => [c.id, c]))
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]))

  let cardIdsForClient: string[] = []
  let profileIdsForClient: string[] = []
  if (client_id) {
    cardIdsForClient = (cards ?? []).filter((c) => c.client_id === client_id).map((c) => c.id)
    profileIdsForClient = (profiles ?? []).filter((p) => p.client_id === client_id).map((p) => p.id)
  }

  let query = supabase
    .from('events')
    .select('id, card_id, profile_id, event_type, source, occurred_at, device_type')
    .eq('is_bot', false)
    .order('occurred_at', { ascending: false })
    .limit(2000)

  if (cutoffIso) {
    query = query.gte('occurred_at', cutoffIso)
  }

  if (card_id) {
    query = query.eq('card_id', card_id)
  } else if (client_id) {
    if (cardIdsForClient.length === 0 && profileIdsForClient.length === 0) {
      // Este cliente no tiene tarjetas ni perfiles -- no puede tener eventos.
      query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    } else {
      const orParts: string[] = []
      if (cardIdsForClient.length) orParts.push(`card_id.in.(${cardIdsForClient.join(',')})`)
      if (profileIdsForClient.length) orParts.push(`profile_id.in.(${profileIdsForClient.join(',')})`)
      query = query.or(orParts.join(','))
    }
  }

  const { data: events, error } = await query

  const filteredClientName = client_id ? (clientMap.get(client_id) ?? null) : null
  const filteredCard = card_id ? cardMap.get(card_id) : null

  const rows = events ?? []
  const totalEvents = rows.length
  const scanRows = rows.filter((e) => e.event_type === 'nfc_scan' || e.event_type === 'qr_scan')
  const totalScans = scanRows.length
  const nfcScans = scanRows.filter((e) => e.source === 'NFC').length
  const qrScans = scanRows.filter((e) => e.source === 'QR').length
  const saveContactCount = rows.filter((e) => e.event_type === 'save_contact').length
  const clickCount = rows.filter(
    (e) => !['nfc_scan', 'qr_scan', 'profile_view'].includes(e.event_type)
  ).length

  const byType = new Map<string, number>()
  const bySource = new Map<string, number>()
  const byDevice = new Map<string, number>()
  const byCard = new Map<string, number>()
  const byProfileView = new Map<string, number>()

  for (const e of rows) {
    byType.set(e.event_type, (byType.get(e.event_type) ?? 0) + 1)
    bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1)
    const device = e.device_type ?? 'unknown'
    byDevice.set(device, (byDevice.get(device) ?? 0) + 1)
    if (e.card_id) byCard.set(e.card_id, (byCard.get(e.card_id) ?? 0) + 1)
    if (e.event_type === 'profile_view' && e.profile_id) {
      byProfileView.set(e.profile_id, (byProfileView.get(e.profile_id) ?? 0) + 1)
    }
  }

  const byTypeSorted = [...byType.entries()].sort((a, b) => b[1] - a[1])
  const topCards = [...byCard.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count]) => ({ id, count, card: cardMap.get(id) }))
  const topProfiles = [...byProfileView.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id, count]) => ({ id, count, profile: profileMap.get(id) }))
  const recentEvents = rows.slice(0, 25)

  const rangeQuery = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    if (client_id) params.set('client_id', client_id)
    if (card_id) params.set('card_id', card_id)
    if (daysParam) params.set('days', daysParam)
    for (const [k, v] of Object.entries(extra)) {
      if (v === undefined) params.delete(k)
      else params.set(k, v)
    }
    const s = params.toString()
    return s ? `/analytics?${s}` : '/analytics'
  }

  return (
    <main className="mx-auto max-w-5xl p-8">
      <AdminHeader />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Analítica</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Escaneos y clics registrados por{' '}
            <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">log_event()</code>. No
            incluye eventos marcados como bot.
          </p>
          {filteredClientName && (
            <p className="mt-1 text-sm text-neutral-500">
              Solo de <strong>{filteredClientName}</strong> --{' '}
              <Link href={rangeQuery({ client_id: undefined })} className="underline">
                ver todos
              </Link>
            </p>
          )}
          {filteredCard && (
            <p className="mt-1 text-sm text-neutral-500">
              Solo de la tarjeta <strong>{filteredCard.card_code}</strong> --{' '}
              <Link href={rangeQuery({ card_id: undefined })} className="underline">
                ver todas
              </Link>
            </p>
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <form method="get" className="flex items-center gap-2">
          {card_id && <input type="hidden" name="card_id" value={card_id} />}
          <input type="hidden" name="days" value={daysParam} />
          <select
            name="client_id"
            defaultValue={client_id ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          >
            <option value="">Todos los clientes</option>
            {clients?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100"
          >
            Filtrar
          </button>
        </form>

        <div className="flex items-center gap-1 text-sm">
          {DAY_OPTIONS.map((opt) => (
            <Link
              key={opt.value}
              href={rangeQuery({ days: opt.value })}
              className={`rounded-md px-3 py-1.5 ${
                daysParam === opt.value
                  ? 'bg-neutral-900 text-white'
                  : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {error && (
        <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar la analítica: {error.message}
        </p>
      )}

      {!error && totalEvents === 0 && (
        <p className="mb-8 rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
          Sin eventos en este rango todavía. Las rutas públicas <code>/n/&#123;code&#125;</code> y{' '}
          <code>/q/&#123;code&#125;</code> son las que normalmente los generan (ver FASE7.md sección
          4) -- mientras tanto puedes crear eventos de prueba desde el SQL Editor, por ejemplo:{' '}
          <code className="block mt-2 rounded bg-neutral-100 px-2 py-1 text-xs">
            select log_event(&apos;nfc_scan&apos;, &apos;NFC&apos;, p_card_code := &apos;REY-000001&apos;);
          </code>
        </p>
      )}

      {!error && totalEvents > 0 && (
        <>
          <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-md border border-neutral-200 p-4">
              <p className="text-2xl font-semibold">{totalEvents}</p>
              <p className="text-sm text-neutral-500">Eventos totales</p>
            </div>
            <div className="rounded-md border border-neutral-200 p-4">
              <p className="text-2xl font-semibold">{totalScans}</p>
              <p className="text-sm text-neutral-500">
                Escaneos ({nfcScans} NFC · {qrScans} QR)
              </p>
            </div>
            <div className="rounded-md border border-neutral-200 p-4">
              <p className="text-2xl font-semibold">{clickCount}</p>
              <p className="text-sm text-neutral-500">Clics de contacto/enlaces</p>
            </div>
            <div className="rounded-md border border-neutral-200 p-4">
              <p className="text-2xl font-semibold">{saveContactCount}</p>
              <p className="text-sm text-neutral-500">Contactos guardados</p>
            </div>
          </section>

          <div className="mb-8 grid gap-6 sm:grid-cols-2">
            <section>
              <h2 className="mb-2 text-sm font-semibold text-neutral-500">Por tipo de evento</h2>
              <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
                {byTypeSorted.map(([type, count]) => (
                  <li key={type} className="flex items-center justify-between px-3 py-2">
                    <span>{EVENT_TYPE_LABELS[type] ?? type}</span>
                    <span className="font-medium text-neutral-900">{count}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold text-neutral-500">Por origen y dispositivo</h2>
              <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
                {[...bySource.entries()].map(([source, count]) => (
                  <li key={source} className="flex items-center justify-between px-3 py-2">
                    <span>{SOURCE_LABELS[source] ?? source}</span>
                    <span className="font-medium text-neutral-900">{count}</span>
                  </li>
                ))}
              </ul>
              <ul className="mt-3 divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
                {[...byDevice.entries()].map(([device, count]) => (
                  <li key={device} className="flex items-center justify-between px-3 py-2">
                    <span className="capitalize">{device}</span>
                    <span className="font-medium text-neutral-900">{count}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {topCards.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-2 text-sm font-semibold text-neutral-500">
                Tarjetas con más actividad
              </h2>
              <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
                {topCards.map(({ id, count, card }) => (
                  <li key={id} className="flex items-center justify-between px-3 py-2">
                    <span>
                      {card ? (
                        <Link href={`/cards/${card.id}`} className="font-medium hover:underline">
                          {card.card_code}
                        </Link>
                      ) : (
                        <span className="text-neutral-400">(tarjeta eliminada)</span>
                      )}
                      {card?.client_id && (
                        <span className="ml-2 text-neutral-400">
                          {clientMap.get(card.client_id) ?? ''}
                        </span>
                      )}
                    </span>
                    <span className="font-medium text-neutral-900">{count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {topProfiles.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-2 text-sm font-semibold text-neutral-500">
                Perfiles con más vistas
              </h2>
              <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
                {topProfiles.map(({ id, count, profile }) => (
                  <li key={id} className="flex items-center justify-between px-3 py-2">
                    <span>
                      {profile ? (
                        <Link href={`/profiles/${profile.id}`} className="font-medium hover:underline">
                          {profile.display_name}
                        </Link>
                      ) : (
                        <span className="text-neutral-400">(perfil eliminado)</span>
                      )}
                    </span>
                    <span className="font-medium text-neutral-900">{count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-neutral-500">
              Eventos más recientes (máx. 25)
            </h2>
            <div className="overflow-x-auto rounded-md border border-neutral-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-100 text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Evento</th>
                    <th className="px-3 py-2 font-medium">Origen</th>
                    <th className="px-3 py-2 font-medium">Tarjeta / perfil</th>
                    <th className="px-3 py-2 font-medium">Dispositivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {recentEvents.map((e) => {
                    const card = e.card_id ? cardMap.get(e.card_id) : null
                    const profile = e.profile_id ? profileMap.get(e.profile_id) : null
                    return (
                      <tr key={e.id} className="hover:bg-neutral-50">
                        <td className="whitespace-nowrap px-3 py-2 text-neutral-600">
                          {fmtDate(e.occurred_at)}
                        </td>
                        <td className="px-3 py-2">{EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}</td>
                        <td className="px-3 py-2 text-neutral-600">{SOURCE_LABELS[e.source] ?? e.source}</td>
                        <td className="px-3 py-2 text-neutral-600">
                          {card ? (
                            <Link href={`/cards/${card.id}`} className="hover:underline">
                              {card.card_code}
                            </Link>
                          ) : profile ? (
                            <Link href={`/profiles/${profile.id}`} className="hover:underline">
                              {profile.display_name}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 text-neutral-600 capitalize">
                          {e.device_type ?? 'unknown'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  )
}
