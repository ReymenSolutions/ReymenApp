import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'
import { resolveEntitlements } from '@reymen/entitlements'
import { getCurrentCompanyUser } from '../../lib/current-company-user'
import { OpsNav } from '../../components/OpsNav'
import { inviteTeamMemberAction } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'El correo y el rol son obligatorios.',
  invalid_email: 'Ese correo no parece válido.',
  invalid_role: 'Ese rol no es válido.',
  forbidden: 'No tienes permiso para hacer eso.',
  email_already_registered:
    'Ya existe una cuenta con ese correo. Si necesitas reinvitarla, contacta a soporte de REYMEN.',
  team_limit_reached:
    'Llegaste al límite de integrantes de tu plan. Contacta a REYMEN para subir de plan y agregar más.',
  invite_failed: 'No se pudo enviar la invitación. Intenta de nuevo.',
}

const STATUS_LABELS: Record<string, string> = {
  invited: 'Invitado',
  active: 'Activo',
  suspended: 'Suspendido',
  removed: 'Eliminado',
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  manager: 'Gerente',
  staff: 'Personal',
  agent: 'Asesor',
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const { error, saved } = await searchParams
  const user = await getCurrentCompanyUser()
  if (!user) redirect('/no-access')

  const canManageTeam = ['owner', 'admin'].includes(user.roleCode)
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  const supabase = await createServerSupabaseClient()
  const entitlements = await resolveEntitlements(supabase, user.companyId)

  // Roster: cualquier miembro activo ve las filas de su company
  // (company_users_select), pero user_profiles solo deja ver la fila propia
  // (user_profiles_select) -- por eso el roster se muestra por rol/estado,
  // sin nombre de cada persona todavía. Ver BLOQUE1_PLAN_LIMITS.md, sección
  // "Qué queda fuera".
  const [{ data: members }, { data: roles }] = await Promise.all([
    supabase
      .from('company_users')
      .select('id, user_id, role_id, status, created_at')
      .eq('company_id', user.companyId)
      .order('created_at', { ascending: true }),
    supabase.from('roles').select('id, code'),
  ])

  const roleCodeById = new Map((roles ?? []).map((r) => [r.id, r.code]))
  const seatCount = (members ?? []).filter((m) => m.status === 'invited' || m.status === 'active').length
  const maxTeamMembers = entitlements.limits.smartcard?.max_team_members as number | undefined
  const atLimit = typeof maxTeamMembers === 'number' && seatCount >= maxTeamMembers

  return (
    <main className="mx-auto max-w-3xl p-8">
      <OpsNav user={user} entitlements={entitlements} />
      <h1 className="text-xl font-semibold">Configuración</h1>

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-500">Empresa</dt>
        <dd>{user.companyName}</dd>
        <dt className="text-neutral-500">Tu rol</dt>
        <dd>{ROLE_LABELS[user.roleCode] ?? user.roleCode}</dd>
      </dl>

      <section className="mt-8">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-neutral-500">Equipo</h2>
          <span className={`text-sm ${atLimit ? 'font-medium text-amber-700' : 'text-neutral-500'}`}>
            {seatCount} / {maxTeamMembers ?? '∞'} integrantes
          </span>
        </div>

        {saved === '1' && (
          <p className="mb-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
            Invitación enviada.
          </p>
        )}
        {errorMessage && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {errorMessage}
          </p>
        )}

        {members && members.length > 0 ? (
          <ul className="mb-4 divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between px-3 py-2">
                <span>
                  {m.user_id === user.userId ? user.email : 'Integrante'} --{' '}
                  {ROLE_LABELS[roleCodeById.get(m.role_id) ?? ''] ?? roleCodeById.get(m.role_id)}
                </span>
                <span className="text-neutral-500">{STATUS_LABELS[m.status] ?? m.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-neutral-500">Todavía no hay integrantes.</p>
        )}

        {canManageTeam ? (
          atLimit ? (
            <p className="rounded-md bg-amber-50 px-3 py-3 text-sm text-amber-800">
              Llegaste al límite de integrantes de tu plan. Contacta a REYMEN para subir de plan.
            </p>
          ) : (
            <form action={inviteTeamMemberAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1">
                <label htmlFor="email" className="text-sm font-medium">
                  Correo
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
                <label htmlFor="role_code" className="text-sm font-medium">
                  Rol
                </label>
                <select
                  id="role_code"
                  name="role_code"
                  defaultValue="staff"
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
                >
                  <option value="admin">Administrador</option>
                  <option value="manager">Gerente</option>
                  <option value="staff">Personal</option>
                  <option value="agent">Asesor</option>
                </select>
              </div>
              <button
                type="submit"
                className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                Invitar
              </button>
            </form>
          )
        ) : (
          <p className="text-sm text-neutral-400">Solo el dueño o un administrador puede invitar integrantes.</p>
        )}
      </section>

      <p className="mt-6 text-sm text-neutral-400">Branding y facturación se agregan en las siguientes fases.</p>
    </main>
  )
}
