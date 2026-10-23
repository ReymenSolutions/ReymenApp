import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'
import { LINK_ICON_OPTIONS } from '@reymen/lib'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { AdminHeader } from '../../../components/AdminHeader'
import {
  updateProfileAction,
  softDeleteProfileAction,
  reactivateProfileAction,
  addProfileLinkAction,
  deleteProfileLinkAction,
  toggleProfileLinkAction,
  moveProfileLinkAction,
  updateProfileLinkIconAction,
} from './actions'
import { uploadProfileMediaAction, removeProfileMediaAction } from './media-actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'El slug y el nombre a mostrar son obligatorios.',
  slug_taken: 'Ese slug ya lo está usando otro perfil activo. Elige uno distinto.',
  slug_invalid:
    'Ese slug no es válido: usa solo minúsculas, números y guiones simples, y confirma que no sea una palabra reservada.',
  save_failed: 'No se pudo guardar el cambio. Intenta de nuevo.',
  forbidden: 'No tienes permiso para hacer eso.',
  link_missing_fields: 'El título y la URL del link son obligatorios.',
  link_url_invalid: 'La URL del link debe empezar con http:// o https://',
  photo_missing: 'Elige un archivo de imagen antes de subir la foto.',
  logo_missing: 'Elige un archivo de imagen antes de subir el logo.',
  photo_invalid: 'La foto debe ser PNG, JPG o WEBP.',
  logo_invalid: 'El logo debe ser PNG, JPG o WEBP.',
  photo_too_big: 'La foto pesa más de 5 MB. Usa una imagen más ligera.',
  logo_too_big: 'El logo pesa más de 5 MB. Usa una imagen más ligera.',
  photo_upload_failed: 'No se pudo subir la foto. Intenta de nuevo.',
  logo_upload_failed: 'No se pudo subir el logo. Intenta de nuevo.',
}

function Field({
  id,
  label,
  defaultValue,
  disabled,
  type = 'text',
}: {
  id: string
  label: string
  defaultValue: string | null
  disabled: boolean
  type?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        disabled={disabled}
        defaultValue={defaultValue ?? ''}
        className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
      />
    </div>
  )
}

function MediaUploader({
  id,
  kind,
  label,
  currentUrl,
  disabled,
}: {
  id: string
  kind: 'photo' | 'logo'
  label: string
  currentUrl: string | null
  disabled: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
      <p className="text-sm font-medium">{label}</p>

      <div className="flex items-center gap-3">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagen dinámica de Storage, no un asset estático del build.
          <img
            src={currentUrl}
            // Fase 17 (accesibilidad): antes era alt="" (tratada como
            // decorativa) -- esta sí es información real para quien usa
            // lector de pantalla, dice cuál de las dos imágenes del perfil
            // está viendo antes de reemplazarla o quitarla.
            alt={`${kind === 'photo' ? 'Foto' : 'Logo'} actual del perfil`}
            className="h-16 w-16 rounded-md border border-neutral-200 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-neutral-300 text-xs text-neutral-400">
            Sin imagen
          </div>
        )}

        {!disabled && (
          <form
            action={uploadProfileMediaAction}
            encType="multipart/form-data"
            className="flex flex-1 flex-col gap-1"
          >
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="kind" value={kind} />
            <input
              type="file"
              name="file"
              accept="image/png,image/jpeg,image/webp"
              required
              className="text-xs file:mr-2 file:rounded file:border-0 file:bg-neutral-100 file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-neutral-200"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="w-fit rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-100"
              >
                {currentUrl ? 'Reemplazar' : 'Subir'}
              </button>
              {currentUrl && (
                <span className="text-xs text-neutral-400">PNG, JPG o WEBP -- máximo 5 MB</span>
              )}
            </div>
          </form>
        )}
      </div>

      {!disabled && currentUrl && (
        <form action={removeProfileMediaAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="kind" value={kind} />
          <button type="submit" className="w-fit text-xs text-red-600 underline">
            Quitar {kind === 'photo' ? 'foto' : 'logo'}
          </button>
        </form>
      )}
    </div>
  )
}

export default async function ProfileDetailPage({
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

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle()
  if (!profile) notFound()

  const [{ data: client }, { data: themes }, { data: links }] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', profile.client_id).maybeSingle(),
    supabase.from('themes').select('id, name').eq('is_active', true).order('name'),
    supabase
      .from('profile_links')
      .select('id, title, url, icon, is_active, sort_order')
      .eq('profile_id', id)
      .order('sort_order', { ascending: true }),
  ])

  const canEdit = admin?.role === 'SUPERADMIN' || admin?.role === 'ADMIN'
  const canDelete = admin?.role === 'SUPERADMIN'
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null
  const disabled = !canEdit

  return (
    <main className="mx-auto max-w-2xl p-8">
      <AdminHeader />

      <Link href="/profiles" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Volver a perfiles
      </Link>

      {profile.deleted_at && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          <p>
            Este perfil está dado de baja desde {new Date(profile.deleted_at).toLocaleString('es-MX')}.
          </p>
          {canDelete && (
            <form action={reactivateProfileAction} className="mt-2">
              <input type="hidden" name="id" value={profile.id} />
              <button type="submit" className="text-sm font-medium underline">
                Reactivar perfil
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

      <h1 className="mb-1 text-xl font-semibold">{profile.display_name}</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Cliente:{' '}
        {client ? (
          <Link href={`/clients/${client.id}`} className="underline">
            {client.name}
          </Link>
        ) : (
          '—'
        )}{' '}
        · link.reymensolutions.mx/{profile.slug}
      </p>

      <form action={updateProfileAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={profile.id} />

        <div className="flex flex-col gap-1">
          <label htmlFor="slug" className="text-sm font-medium">
            Slug <span className="text-red-600">*</span>
          </label>
          <input
            id="slug"
            name="slug"
            type="text"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            disabled={disabled}
            defaultValue={profile.slug}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <Field id="display_name" label="Nombre a mostrar *" defaultValue={profile.display_name} disabled={disabled} />

        <div className="grid grid-cols-2 gap-4">
          <Field id="first_name" label="Nombre(s)" defaultValue={profile.first_name} disabled={disabled} />
          <Field id="last_name" label="Apellido(s)" defaultValue={profile.last_name} disabled={disabled} />
        </div>

        <Field id="job_title" label="Puesto" defaultValue={profile.job_title} disabled={disabled} />
        <Field id="company" label="Empresa" defaultValue={profile.company} disabled={disabled} />

        <div className="flex flex-col gap-1">
          <label htmlFor="bio" className="text-sm font-medium">
            Bio
          </label>
          <textarea
            id="bio"
            name="bio"
            rows={2}
            disabled={disabled}
            defaultValue={profile.bio ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field id="photo_url" label="URL de foto" defaultValue={profile.photo_url} disabled={disabled} />
          <Field id="logo_url" label="URL de logo" defaultValue={profile.logo_url} disabled={disabled} />
        </div>
        <p className="-mt-2 text-xs text-neutral-400">
          También se puede pegar aquí la URL de una imagen ya alojada en otro lugar -- subir un
          archivo (abajo) sobrescribe este campo automáticamente.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <Field id="phone" label="Teléfono" defaultValue={profile.phone} disabled={disabled} type="tel" />
          <Field id="whatsapp" label="WhatsApp" defaultValue={profile.whatsapp} disabled={disabled} type="tel" />
        </div>

        <Field id="email" label="Correo" defaultValue={profile.email} disabled={disabled} type="email" />
        <Field id="website" label="Sitio web" defaultValue={profile.website} disabled={disabled} type="url" />
        <Field id="address" label="Dirección" defaultValue={profile.address} disabled={disabled} />
        <Field id="maps_url" label="URL de Google Maps" defaultValue={profile.maps_url} disabled={disabled} type="url" />

        <div className="grid grid-cols-2 gap-4">
          <Field id="instagram" label="Instagram" defaultValue={profile.instagram} disabled={disabled} type="url" />
          <Field id="facebook" label="Facebook" defaultValue={profile.facebook} disabled={disabled} type="url" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field id="linkedin" label="LinkedIn" defaultValue={profile.linkedin} disabled={disabled} type="url" />
          <Field id="tiktok" label="TikTok" defaultValue={profile.tiktok} disabled={disabled} type="url" />
        </div>
        <Field id="youtube" label="YouTube" defaultValue={profile.youtube} disabled={disabled} type="url" />

        <div className="flex flex-col gap-1">
          <label htmlFor="theme_id" className="text-sm font-medium">
            Tema visual
          </label>
          <select
            id="theme_id"
            name="theme_id"
            disabled={disabled}
            defaultValue={profile.theme_id ?? ''}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            <option value="">Sin tema (usa el default)</option>
            {themes?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium">
            Estado
          </label>
          <select
            id="status"
            name="status"
            disabled={disabled}
            defaultValue={profile.status}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            <option value="ACTIVE">Activo</option>
            <option value="INACTIVE">Inactivo</option>
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_noindex"
            disabled={disabled}
            defaultChecked={profile.is_noindex}
          />
          No indexar en buscadores (noindex)
        </label>

        {canEdit && (
          <button
            type="submit"
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Guardar cambios
          </button>
        )}
      </form>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">Foto y logo</h2>
        {/* Fuera del <form> de arriba a propósito -- cada subida es su
            propio <form> (necesita encType="multipart/form-data" para el
            archivo) y un <form> no puede anidarse dentro de otro sin que el
            navegador rompa la serialización de ambos. */}
        <div className="grid grid-cols-2 gap-4">
          <MediaUploader
            id={profile.id}
            kind="photo"
            label="Foto"
            currentUrl={profile.photo_url}
            disabled={disabled}
          />
          <MediaUploader
            id={profile.id}
            kind="logo"
            label="Logo"
            currentUrl={profile.logo_url}
            disabled={disabled}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-2 text-sm font-semibold text-neutral-500">
          Links del perfil público ({links?.length ?? 0})
        </h2>

        {!links?.length && <p className="text-sm text-neutral-400">Sin links todavía.</p>}

        {!!links?.length && (
          <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
            {links.map((link, index) => (
              <li key={link.id} className="flex flex-col gap-2 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${!link.is_active ? 'text-neutral-400' : ''}`}>
                      {link.title}
                    </p>
                    <p className="truncate text-xs text-neutral-400">{link.url}</p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-2">
                      <form action={moveProfileLinkAction}>
                        <input type="hidden" name="profile_id" value={id} />
                        <input type="hidden" name="link_id" value={link.id} />
                        <input type="hidden" name="direction" value="up" />
                        <button
                          type="submit"
                          disabled={index === 0}
                          className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                          aria-label="Subir"
                        >
                          ↑
                        </button>
                      </form>
                      <form action={moveProfileLinkAction}>
                        <input type="hidden" name="profile_id" value={id} />
                        <input type="hidden" name="link_id" value={link.id} />
                        <input type="hidden" name="direction" value="down" />
                        <button
                          type="submit"
                          disabled={index === links.length - 1}
                          className="text-neutral-500 hover:text-neutral-900 disabled:opacity-30"
                          aria-label="Bajar"
                        >
                          ↓
                        </button>
                      </form>
                      <form action={toggleProfileLinkAction}>
                        <input type="hidden" name="profile_id" value={id} />
                        <input type="hidden" name="link_id" value={link.id} />
                        <input type="hidden" name="next_active" value={(!link.is_active).toString()} />
                        <button type="submit" className="text-xs text-neutral-500 underline">
                          {link.is_active ? 'Desactivar' : 'Activar'}
                        </button>
                      </form>
                      <form action={deleteProfileLinkAction}>
                        <input type="hidden" name="profile_id" value={id} />
                        <input type="hidden" name="link_id" value={link.id} />
                        <button type="submit" className="text-xs text-red-600 underline">
                          Eliminar
                        </button>
                      </form>
                    </div>
                  )}
                </div>
                {canEdit && (
                  // Fase 17.1: cambiar el ícono sin borrar/recrear el link --
                  // acción aparte (updateProfileLinkIconAction), un solo
                  // campo. defaultValue="" cuando link.icon es null/inválido
                  // muestra "Genérico (por default)" seleccionado, igual
                  // que se ve hoy en ProfileView.tsx.
                  <form action={updateProfileLinkIconAction} className="flex items-center gap-2">
                    <input type="hidden" name="profile_id" value={id} />
                    <input type="hidden" name="link_id" value={link.id} />
                    <label htmlFor={`icon-${link.id}`} className="text-xs text-neutral-500">
                      Ícono
                    </label>
                    <select
                      id={`icon-${link.id}`}
                      name="icon"
                      defaultValue={link.icon ?? ''}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-500"
                    >
                      {LINK_ICON_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="text-xs underline">
                      Guardar
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {canEdit && (
          <form action={addProfileLinkAction} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="profile_id" value={id} />
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="link_title" className="text-xs font-medium text-neutral-500">
                Título
              </label>
              <input
                id="link_title"
                name="title"
                type="text"
                required
                placeholder="Ver propiedades"
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              />
            </div>
            <div className="flex flex-[2] flex-col gap-1">
              <label htmlFor="link_url" className="text-xs font-medium text-neutral-500">
                URL
              </label>
              <input
                id="link_url"
                name="url"
                type="url"
                required
                placeholder="https://..."
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="link_icon" className="text-xs font-medium text-neutral-500">
                Ícono
              </label>
              <select
                id="link_icon"
                name="icon"
                defaultValue=""
                className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
              >
                {LINK_ICON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100"
            >
              + Agregar link
            </button>
          </form>
        )}
      </section>

      {canDelete && !profile.deleted_at && (
        <form action={softDeleteProfileAction} className="mt-10 border-t border-neutral-200 pt-4">
          <input type="hidden" name="id" value={profile.id} />
          <button type="submit" className="text-sm text-red-600 underline">
            Dar de baja este perfil
          </button>
        </form>
      )}
    </main>
  )
}
