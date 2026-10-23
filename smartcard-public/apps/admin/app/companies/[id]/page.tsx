import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { AdminHeader } from '../../../components/AdminHeader'
import { updateCompanyAction, setExternalOrgIdAction } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_name: 'El nombre es obligatorio.',
  missing_slug: 'El slug es obligatorio.',
  slug_taken: 'Ese slug ya lo usa otra empresa.',
  org_id_taken: 'Ese organizationId ya está vinculado a otra empresa.',
  save_failed: 'No se pudo guardar el cambio. Intenta de nuevo.',
  forbidden: 'No tienes permiso para hacer eso.',
}

export default async function CompanyDetailPage({
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

  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!company) notFound()

  const [{ data: plan }, { data: companyUsers }] = await Promise.all([
    company.current_plan_id
      ? supabase.from('plans').select('name, code').eq('id', company.current_plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('company_users')
      .select('user_id, status, roles(code, name)')
      .eq('company_id', id),
  ])

  const canEdit = admin?.role === 'SUPERADMIN' || admin?.role === 'ADMIN'
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  return (
    <main className="mx-auto max-w-2xl p-8">
      <AdminHeader />

      <Link href="/companies" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Volver a empresas
      </Link>

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

      <h1 className="mb-1 text-xl font-semibold">{company.name}</h1>
      <p className="mb-6 text-sm text-neutral-400">
        {plan ? `Plan: ${plan.name}` : 'Sin plan asignado'}
      </p>

      <form action={updateCompanyAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={company.id} />

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
            defaultValue={company.name}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
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
            disabled={!canEdit}
            defaultValue={company.slug}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="industry" className="text-sm font-medium">
            Industria
          </label>
          <input
            id="industry"
            name="industry"
            type="text"
            disabled={!canEdit}
            defaultValue={company.industry ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="billing_email" className="text-sm font-medium">
            Correo de facturación
          </label>
          <input
            id="billing_email"
            name="billing_email"
            type="email"
            disabled={!canEdit}
            defaultValue={company.billing_email ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="timezone" className="text-sm font-medium">
            Zona horaria
          </label>
          <input
            id="timezone"
            name="timezone"
            type="text"
            disabled={!canEdit}
            defaultValue={company.timezone}
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
            defaultValue={company.status}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            <option value="trial">Prueba</option>
            <option value="active">Activa</option>
            <option value="past_due">Pago vencido</option>
            <option value="suspended">Suspendida</option>
            <option value="cancelled">Cancelada</option>
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

      <section className="mt-8 border-t border-neutral-200 pt-6">
        <h2 className="text-sm font-semibold text-neutral-500">SmartCard SSO (Reymen-AI-OPS-Platform)</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Vincula esta empresa con su organización correspondiente en Reymen-AI-OPS-Platform (el
          otro sistema de Reymen). Cuando está vinculada, un usuario de esa organización con el
          módulo NFC_QR activo entra aquí sin pedir contraseña otra vez. Solo staff de Reymen puede
          tocar este campo -- está protegido también a nivel de base de datos, aunque alguien
          intente cambiarlo por fuera de esta pantalla.
        </p>
        <form action={setExternalOrgIdAction} className="mt-3 flex flex-col gap-1">
          <input type="hidden" name="id" value={company.id} />
          <label htmlFor="external_org_id" className="text-sm font-medium">
            organizationId (Reymen-AI-OPS-Platform)
          </label>
          <div className="flex gap-2">
            <input
              id="external_org_id"
              name="external_org_id"
              type="text"
              disabled={!canEdit}
              placeholder="cuid, ej. clx1a2b3c4d5e6f7g8h9i0j1k"
              defaultValue={company.external_org_id ?? ''}
              className="flex-1 rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
            />
            {canEdit && (
              <button
                type="submit"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100"
              >
                {company.external_org_id ? 'Actualizar' : 'Vincular'}
              </button>
            )}
          </div>
          <p className="text-xs text-neutral-400">
            Déjalo vacío y guarda para desvincular. El valor debe coincidir exactamente con el
            organizationId de Prisma del lado de Reymen-AI-OPS-Platform.
          </p>
        </form>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">
          Usuarios de la empresa ({companyUsers?.length ?? 0})
        </h2>
        {!companyUsers?.length && (
          <p className="text-sm text-neutral-400">Sin usuarios todavía.</p>
        )}
        {!!companyUsers?.length && (
          <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
            {companyUsers.map((cu) => (
              <li key={cu.user_id} className="flex items-center justify-between px-3 py-2">
                <span className="font-mono text-xs text-neutral-500">{cu.user_id}</span>
                <span className="text-neutral-400">
                  {(cu.roles as unknown as { name?: string } | null)?.name ?? '—'} · {cu.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
