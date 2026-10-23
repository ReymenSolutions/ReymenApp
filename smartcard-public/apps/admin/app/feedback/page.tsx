import { createServerSupabaseClient } from '@reymen/database'
import { AdminHeader } from '../../components/AdminHeader'
import { submitAdminFeedbackAction } from './actions'

// -----------------------------------------------------------------------
// Fase 17 -- /feedback. Mismo criterio de acceso que /analytics (Fase 8):
// la policy feedback_select (20260912120002_feedback.sql) ya abre lectura a
// los 3 roles, así que no hay rama canEdit/canDelete aquí tampoco -- esta
// fase deja el canal LEGIBLE, no un flujo de triage (marcar
// resuelto/asignar) -- ver FASE17.md sección 3/4, eso queda para más
// adelante si el volumen de reportes lo justifica.
// -----------------------------------------------------------------------

const SOURCE_LABELS: Record<string, string> = {
  public_profile: 'Perfil público',
  admin_panel: 'Panel admin',
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_message: 'Escribe qué encontraste antes de enviar.',
  save_failed: 'No se pudo enviar el reporte. Intenta de nuevo.',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>
}) {
  const { sent, error } = await searchParams
  const supabase = await createServerSupabaseClient()

  const { data: reports, error: loadError } = await supabase
    .from('feedback')
    .select('id, source, message, contact_email, profile_id, admin_id, page_url, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  // Igual que /analytics con cards/profiles: se resuelven los ids a nombres
  // legibles con consultas aparte en vez de un embed anidado (Relationships: []
  // en packages/database/src/types.ts, mismo motivo de siempre).
  const profileIds = [...new Set((reports ?? []).map((r) => r.profile_id).filter(Boolean))] as string[]
  const adminIds = [...new Set((reports ?? []).map((r) => r.admin_id).filter(Boolean))] as string[]

  const [{ data: profiles }, { data: admins }] = await Promise.all([
    profileIds.length
      ? supabase.from('profiles').select('id, display_name, slug').in('id', profileIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string; slug: string }[] }),
    adminIds.length
      ? supabase.from('admin_profiles').select('id, full_name').in('id', adminIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
  ])

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
  const adminMap = new Map((admins ?? []).map((a) => [a.id, a.full_name]))

  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  return (
    <main className="mx-auto max-w-3xl p-8">
      <AdminHeader />

      <h1 className="mb-1 text-xl font-semibold">Feedback</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Reportes de problemas, desde el perfil público de un cliente o desde este mismo panel (Fase
        17). Por ahora es de solo lectura -- sin marcar como resuelto todavía.
      </p>

      <section className="mb-10 rounded-md border border-neutral-200 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-500">Reportar un problema</h2>

        {sent === '1' && (
          <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            Gracias -- quedó registrado abajo.
          </p>
        )}
        {message && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {message}
          </p>
        )}

        <form action={submitAdminFeedbackAction} className="flex flex-col gap-3">
          <textarea
            name="message"
            required
            rows={3}
            maxLength={2000}
            placeholder="¿Qué encontraste? Ej. un botón que no responde, un dato que se ve mal..."
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
          <button
            type="submit"
            className="w-fit rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Enviar reporte
          </button>
        </form>
      </section>

      {loadError && (
        <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo cargar el listado: {loadError.message}
        </p>
      )}

      {!loadError && (reports?.length ?? 0) === 0 && (
        <p className="rounded-md bg-neutral-50 px-3 py-3 text-sm text-neutral-500">
          Sin reportes todavía.
        </p>
      )}

      {!loadError && !!reports?.length && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">
            Reportes ({reports.length}
            {reports.length === 200 ? '+' : ''})
          </h2>
          <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
            {reports.map((r) => {
              const profile = r.profile_id ? profileMap.get(r.profile_id) : null
              const adminName = r.admin_id ? adminMap.get(r.admin_id) : null
              return (
                <li key={r.id} className="flex flex-col gap-1 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
                    <span className="flex items-center gap-2">
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium">
                        {SOURCE_LABELS[r.source] ?? r.source}
                      </span>
                      {profile && <span>· {profile.display_name} (/{profile.slug})</span>}
                      {adminName && <span>· reportado por {adminName}</span>}
                    </span>
                    <span>{fmtDate(r.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-neutral-900">{r.message}</p>
                  {r.contact_email && (
                    <p className="text-xs text-neutral-500">Contacto: {r.contact_email}</p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </main>
  )
}
