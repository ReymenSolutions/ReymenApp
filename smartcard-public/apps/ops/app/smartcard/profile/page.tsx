import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'
import { resolveEntitlements, hasModule, hasPermission } from '@reymen/entitlements'
import { passesWcagAA } from '@reymen/lib'
import { getCurrentCompanyUser } from '../../../lib/current-company-user'
import { OpsNav } from '../../../components/OpsNav'
import { upsertProfileAction, uploadProfileMediaAction } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'El nombre a mostrar y el slug son obligatorios.',
  slug_taken: 'Ese slug ya lo usa otro perfil. Prueba otro.',
  slug_invalid: 'El slug solo puede tener minúsculas, números y guiones.',
  save_failed: 'No se pudo guardar el cambio. Intenta de nuevo.',
  forbidden: 'Tu rol no tiene permiso para editar el perfil digital.',
  photo_missing: 'Elige un archivo para la foto.',
  photo_invalid: 'La foto debe ser PNG, JPEG o WEBP.',
  photo_too_big: 'La foto pesa más de 5 MB.',
  photo_upload_failed: 'No se pudo subir la foto. Intenta de nuevo.',
  logo_missing: 'Elige un archivo para el logo.',
  logo_invalid: 'El logo debe ser PNG, JPEG o WEBP.',
  logo_too_big: 'El logo pesa más de 5 MB.',
  logo_upload_failed: 'No se pudo subir el logo. Intenta de nuevo.',
}

// REYMEN Ops -- Fase 2 (SmartCard autoservicio). Crear/editar EL perfil
// digital de la empresa, acotado a "contacto + tema básico" (alcance
// confirmado para esta ronda): sin theme_id (catálogo de themes, lo sigue
// asignando REYMEN) ni is_noindex/status (siguen siendo de staff interno).
export default async function SmartcardProfilePage({
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

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const profile = profiles && profiles.length > 0 ? profiles[0] : null
  const overrides = (profile?.theme_overrides ?? {}) as Record<string, unknown>
  const primaryColor = typeof overrides.primary_color === 'string' ? overrides.primary_color : '#111111'
  const accentColor = typeof overrides.accent_color === 'string' ? overrides.accent_color : '#4F46E5'

  // Mismos dos pares de referencia que /settings/themes en apps/admin
  // (Fase 17, ver ese archivo para el porqué de los hex fijos).
  const accentWarning = !passesWcagAA(accentColor, '#262922')
  const primaryWarning = !passesWcagAA(primaryColor, '#FFFFFF', true)

  return (
    <main className="mx-auto max-w-lg p-8">
      <OpsNav user={user} entitlements={entitlements} />

      <Link href="/smartcard" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Volver a SmartCard
      </Link>

      <h1 className="mb-1 text-xl font-semibold">
        {profile ? 'Editar perfil digital' : 'Crear perfil digital'}
      </h1>
      <p className="mb-6 text-sm text-neutral-500">
        Esto es lo que ve quien escanee una tarjeta configurada con destino &quot;Perfil
        digital&quot;.
      </p>

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

      {!canEdit && (
        <p className="mb-4 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
          Tu rol solo puede ver esta información, no editarla.
        </p>
      )}

      <form action={upsertProfileAction} className="flex flex-col gap-4">
        {profile && <input type="hidden" name="id" value={profile.id} />}

        <div className="flex flex-col gap-1">
          <label htmlFor="display_name" className="text-sm font-medium">
            Nombre a mostrar <span className="text-red-600">*</span>
          </label>
          <input
            id="display_name" name="display_name" type="text" required disabled={!canEdit}
            defaultValue={profile?.display_name ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="slug" className="text-sm font-medium">
            Slug (URL pública) <span className="text-red-600">*</span>
          </label>
          <input
            id="slug" name="slug" type="text" required disabled={!canEdit}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            defaultValue={profile?.slug ?? ''}
            placeholder="recepcion-villa-gardenia"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="first_name" className="text-sm font-medium">Nombre</label>
            <input id="first_name" name="first_name" type="text" disabled={!canEdit}
              defaultValue={profile?.first_name ?? ''}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="last_name" className="text-sm font-medium">Apellido</label>
            <input id="last_name" name="last_name" type="text" disabled={!canEdit}
              defaultValue={profile?.last_name ?? ''}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="job_title" className="text-sm font-medium">Puesto</label>
          <input id="job_title" name="job_title" type="text" disabled={!canEdit}
            defaultValue={profile?.job_title ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="bio" className="text-sm font-medium">Bio</label>
          <textarea id="bio" name="bio" rows={3} disabled={!canEdit}
            defaultValue={profile?.bio ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="phone" className="text-sm font-medium">Teléfono</label>
            <input id="phone" name="phone" type="tel" disabled={!canEdit}
              defaultValue={profile?.phone ?? ''}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="whatsapp" className="text-sm font-medium">WhatsApp</label>
            <input id="whatsapp" name="whatsapp" type="tel" disabled={!canEdit}
              defaultValue={profile?.whatsapp ?? ''}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">Correo</label>
          <input id="email" name="email" type="email" disabled={!canEdit}
            defaultValue={profile?.email ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="website" className="text-sm font-medium">Sitio web</label>
          <input id="website" name="website" type="url" disabled={!canEdit}
            defaultValue={profile?.website ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="address" className="text-sm font-medium">Dirección</label>
          <input id="address" name="address" type="text" disabled={!canEdit}
            defaultValue={profile?.address ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="maps_url" className="text-sm font-medium">Link de Google Maps</label>
          <input id="maps_url" name="maps_url" type="url" disabled={!canEdit}
            defaultValue={profile?.maps_url ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {(['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube'] as const).map((field) => (
            <div key={field} className="flex flex-col gap-1">
              <label htmlFor={field} className="text-sm font-medium capitalize">{field}</label>
              <input id={field} name={field} type="url" disabled={!canEdit}
                defaultValue={(profile?.[field] as string | null) ?? ''}
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500" />
            </div>
          ))}
        </div>

        <div className="mt-2 border-t border-neutral-200 pt-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">Tema</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="primary_color" className="text-sm font-medium">Color principal</label>
              <input id="primary_color" name="primary_color" type="color" disabled={!canEdit}
                defaultValue={primaryColor}
                className="h-10 w-full rounded-md border border-neutral-300" />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="accent_color" className="text-sm font-medium">Color de acento</label>
              <input id="accent_color" name="accent_color" type="color" disabled={!canEdit}
                defaultValue={accentColor}
                className="h-10 w-full rounded-md border border-neutral-300" />
            </div>
          </div>
          {(accentWarning || primaryWarning) && (
            <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
              ⚠ Contraste bajo: con estos colores, el botón o los íconos del perfil podrían
              costar trabajo leer.
            </p>
          )}
        </div>

        {canEdit && (
          <button type="submit"
            className="mt-2 rounded-md bg-[#04275A] px-3 py-2 text-sm font-medium text-white hover:bg-[#063C82]">
            Guardar cambios
          </button>
        )}
      </form>

      {profile && canEdit && (
        <section className="mt-8 border-t border-neutral-200 pt-6">
          <h2 className="mb-2 text-sm font-semibold text-neutral-700">Foto y logo</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-500">Foto</p>
              {profile.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.photo_url} alt="Foto actual del perfil" className="mb-2 h-16 w-16 rounded-full object-cover" />
              )}
              <form action={uploadProfileMediaAction} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={profile.id} />
                <input type="hidden" name="kind" value="photo" />
                <input type="file" name="file" accept="image/png,image/jpeg,image/webp" className="text-xs" />
                <button type="submit" className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100">
                  Subir foto
                </button>
              </form>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-neutral-500">Logo</p>
              {profile.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.logo_url} alt="Logo actual del perfil" className="mb-2 h-16 w-16 rounded-md object-contain" />
              )}
              <form action={uploadProfileMediaAction} className="flex flex-col gap-2">
                <input type="hidden" name="id" value={profile.id} />
                <input type="hidden" name="kind" value="logo" />
                <input type="file" name="file" accept="image/png,image/jpeg,image/webp" className="text-xs" />
                <button type="submit" className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100">
                  Subir logo
                </button>
              </form>
            </div>
          </div>
          <p className="mt-2 text-xs text-neutral-400">PNG, JPEG o WEBP, máximo 5 MB.</p>
        </section>
      )}

      {!profile && (
        <p className="mt-6 text-sm text-neutral-400">
          Guarda primero los datos de arriba -- después de crear el perfil vas a poder subir
          foto y logo aquí mismo.
        </p>
      )}
    </main>
  )
}
