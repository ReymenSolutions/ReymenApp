import Link from 'next/link'
import { createServerSupabaseClient } from '@reymen/database'
import { passesWcagAA } from '@reymen/lib'
import { getCurrentAdmin } from '../../lib/current-admin'
import { AdminHeader } from '../../components/AdminHeader'
import { parseThemeConfig } from '../../lib/theme-config'
import { createDestinationTypeAction, updateDestinationTypeLabelAction, toggleDestinationTypeAction } from './destination-types/actions'
import { addReservedSlugAction, deleteReservedSlugAction } from './reserved-slugs/actions'

// -----------------------------------------------------------------------
// Fase 10 -- /settings. A diferencia de /users (Fase 9, exclusiva de
// SUPERADMIN porque la propia RLS de admin_profiles ya limita a ADMIN/VIEWER
// a ver solo su propia fila), los 3 catálogos de esta pantalla (themes,
// destination_types, reserved_slugs) SÍ tienen policy de SELECT abierta a
// los 3 roles desde Fase 2 (rls_policies.sql: "...ADMIN, VIEWER) -- lectura
// para el panel"). Por eso esta pantalla sigue el mismo patrón que
// clientes/perfiles/tarjetas: visible para los 3, edición solo SUPERADMIN.
// -----------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'Faltan campos obligatorios.',
  invalid_code: 'El código debe ser MAYÚSCULAS, números y guion bajo (ej. GOOGLE_REVIEWS).',
  invalid_slug: 'Ese slug no es válido: usa minúsculas, números, guiones o puntos.',
  code_taken: 'Ya existe un tipo de destino con ese código.',
  slug_taken: 'Ese slug ya está en la lista de reservados.',
  save_failed: 'No se pudo guardar el cambio. Intenta de nuevo.',
  forbidden: 'No tienes permiso para hacer eso.',
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const admin = await getCurrentAdmin()
  const supabase = await createServerSupabaseClient()

  const [{ data: themes }, { data: destinationTypes }, { data: reservedSlugs }] = await Promise.all([
    supabase.from('themes').select('id, name, slug, config, is_active').order('name'),
    supabase.from('destination_types').select('*').order('sort_order'),
    supabase.from('reserved_slugs').select('slug').order('slug'),
  ])

  const canEdit = admin?.role === 'SUPERADMIN'
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  return (
    <main className="mx-auto max-w-4xl p-8">
      <AdminHeader />

      <h1 className="mb-6 text-xl font-semibold">Ajustes</h1>

      {message && (
        <p className="mb-6 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {message}
        </p>
      )}

      {!canEdit && (
        <p className="mb-6 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
          Puedes ver estos catálogos, pero solo un SUPERADMIN puede modificarlos.
        </p>
      )}

      {/* ------------------------------------------------------------- */}
      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-500">
            Temas ({themes?.length ?? 0})
          </h2>
          {canEdit && (
            <Link href="/settings/themes/new" className="text-sm underline">
              + Nuevo theme
            </Link>
          )}
        </div>
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
          {themes?.map((t) => {
            const fields = parseThemeConfig(t.config)
            // Fase 17 (accesibilidad): mismo par de comprobaciones contra
            // los colores fijos que ProfileView.tsx pinta encima de
            // accent_color/primary_color -- el texto blanco/oscuro del
            // botón "Guardar contacto" (#262922) y los íconos sobre chip
            // claro (#FFFFFF). No bloquea nada, solo hace visible en la
            // lista qué themes conviene revisar.
            const lowContrast =
              !passesWcagAA(fields.accent_color, '#262922') ||
              !passesWcagAA(fields.primary_color, '#FFFFFF', true)
            return (
              <li key={t.id} className="flex items-center justify-between px-3 py-2">
                <span className="flex items-center gap-3">
                  <span className="flex gap-1">
                    <span
                      title="Color primario"
                      className="h-4 w-4 rounded-full border border-neutral-300"
                      style={{ backgroundColor: fields.primary_color }}
                    />
                    <span
                      title="Color de acento"
                      className="h-4 w-4 rounded-full border border-neutral-300"
                      style={{ backgroundColor: fields.accent_color }}
                    />
                  </span>
                  {canEdit ? (
                    <Link href={`/settings/themes/${t.id}`} className="font-medium hover:underline">
                      {t.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{t.name}</span>
                  )}
                  <span className="text-neutral-400">/{t.slug}</span>
                </span>
                <span className="flex items-center gap-2">
                  {lowContrast && (
                    <span
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                      title="El texto del botón de contacto o los íconos podrían no leerse bien con estos colores (contraste bajo WCAG AA)."
                    >
                      ⚠ contraste bajo
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'
                    }`}
                  >
                    {t.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {/* ------------------------------------------------------------- */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold text-neutral-500">
          Tipos de destino ({destinationTypes?.length ?? 0})
        </h2>
        <p className="mb-3 text-sm text-neutral-500">
          Solo el nombre visible y el estado se editan aquí. Si necesitas requisitos distintos
          (con/sin perfil, con/sin URL), da de alta un tipo nuevo -- ver FASE10.md.
        </p>
        <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 text-sm">
          {destinationTypes?.map((d) => (
            <li key={d.code} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="w-40 shrink-0 font-mono text-xs text-neutral-400">{d.code}</span>
                {canEdit ? (
                  <form action={updateDestinationTypeLabelAction} className="flex items-center gap-2">
                    <input type="hidden" name="code" value={d.code} />
                    <input
                      name="label"
                      defaultValue={d.label}
                      className="rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
                    />
                    <button type="submit" className="text-xs underline">
                      Guardar
                    </button>
                  </form>
                ) : (
                  <span>{d.label}</span>
                )}
                <span className="text-xs text-neutral-400">
                  {d.requires_profile ? 'requiere perfil' : d.requires_url ? 'requiere URL' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    d.is_active ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-600'
                  }`}
                >
                  {d.is_active ? 'Activo' : 'Inactivo'}
                </span>
                {canEdit && (
                  <form action={toggleDestinationTypeAction}>
                    <input type="hidden" name="code" value={d.code} />
                    <input type="hidden" name="next_active" value={(!d.is_active).toString()} />
                    <button type="submit" className="text-xs underline">
                      {d.is_active ? 'Desactivar' : 'Reactivar'}
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>

        {canEdit && (
          <form
            action={createDestinationTypeAction}
            className="mt-4 flex flex-wrap items-end gap-3 rounded-md border border-dashed border-neutral-300 p-3"
          >
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Código</label>
              <input
                name="code"
                placeholder="TIKTOK"
                required
                className="w-32 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Nombre visible</label>
              <input
                name="label"
                placeholder="TikTok"
                required
                className="w-40 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
              />
            </div>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="requires_profile" /> requiere perfil
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="requires_url" defaultChecked /> requiere URL
            </label>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">Orden</label>
              <input
                name="sort_order"
                type="number"
                defaultValue={(destinationTypes?.length ?? 0) + 1}
                className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-500"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              + Agregar tipo
            </button>
          </form>
        )}
      </section>

      {/* ------------------------------------------------------------- */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-neutral-500">
          Slugs reservados ({reservedSlugs?.length ?? 0})
        </h2>
        <p className="mb-3 text-sm text-neutral-500">
          Nadie puede crear un perfil con uno de estos slugs (
          <code className="rounded bg-neutral-100 px-1 py-0.5 text-xs">prevent_reserved_slug()</code>
          , desde Fase 2).
        </p>
        <div className="flex flex-wrap gap-2">
          {reservedSlugs?.map((r) => (
            <span
              key={r.slug}
              className="flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700"
            >
              {r.slug}
              {canEdit && (
                <form action={deleteReservedSlugAction}>
                  <input type="hidden" name="slug" value={r.slug} />
                  <button type="submit" className="text-neutral-400 hover:text-red-600" title="Eliminar">
                    ×
                  </button>
                </form>
              )}
            </span>
          ))}
        </div>

        {canEdit && (
          <form action={addReservedSlugAction} className="mt-4 flex items-center gap-2">
            <input
              name="slug"
              placeholder="ej. blog"
              required
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
            />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              + Agregar
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
