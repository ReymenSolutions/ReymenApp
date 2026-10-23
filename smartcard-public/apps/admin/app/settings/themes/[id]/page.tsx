import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerSupabaseClient } from '@reymen/database'
import { passesWcagAA } from '@reymen/lib'
import { getCurrentAdmin } from '../../../../lib/current-admin'
import { AdminHeader } from '../../../../components/AdminHeader'
import { LAYOUT_OPTIONS, BORDER_RADIUS_OPTIONS, FONT_OPTIONS, parseThemeConfig } from '../../../../lib/theme-config'
import { updateThemeAction } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'El nombre y el slug son obligatorios.',
  invalid_config: 'Revisa los colores (formato #RRGGBB) y las opciones elegidas.',
  slug_taken: 'Ya existe otro theme con ese slug.',
  save_failed: 'No se pudo guardar el cambio. Intenta de nuevo.',
  forbidden: 'No tienes permiso para hacer eso.',
}

export default async function ThemeDetailPage({
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

  const { data: theme } = await supabase.from('themes').select('*').eq('id', id).maybeSingle()
  if (!theme) notFound()

  const { count: profilesUsingIt } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('theme_id', id)
    .is('deleted_at', null)

  const canEdit = admin?.role === 'SUPERADMIN'
  const fields = parseThemeConfig(theme.config)
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  // Fase 17 (accesibilidad): mismos dos pares que en /settings -- accent_color
  // contra el texto fijo del botón "Guardar contacto" (#262922) y
  // primary_color contra el fondo de chip claro (#FFFFFF) donde van los
  // íconos. Solo informa, no bloquea guardar -- ver FASE17.md sección 1.
  const accentWarning = !passesWcagAA(fields.accent_color, '#262922')
  const primaryWarning = !passesWcagAA(fields.primary_color, '#FFFFFF', true)

  return (
    <main className="mx-auto max-w-lg p-8">
      <AdminHeader />

      <Link href="/settings" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Volver a ajustes
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

      <h1 className="mb-1 text-xl font-semibold">{theme.name}</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Usado por {profilesUsingIt ?? 0} perfil{profilesUsingIt === 1 ? '' : 'es'}. Desactivarlo no
        les afecta -- solo deja de aparecer como opción al crear un perfil nuevo.
      </p>

      <form action={updateThemeAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={theme.id} />

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
            defaultValue={theme.name}
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
            pattern="[a-z0-9_]+"
            defaultValue={theme.slug}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="primary_color" className="text-sm font-medium">
              Color primario
            </label>
            <input
              id="primary_color"
              name="primary_color"
              type="color"
              disabled={!canEdit}
              defaultValue={fields.primary_color}
              className="h-10 w-full rounded-md border border-neutral-300"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="accent_color" className="text-sm font-medium">
              Color de acento
            </label>
            <input
              id="accent_color"
              name="accent_color"
              type="color"
              disabled={!canEdit}
              defaultValue={fields.accent_color}
              className="h-10 w-full rounded-md border border-neutral-300"
            />
          </div>
        </div>

        {(accentWarning || primaryWarning) && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            ⚠ Contraste bajo (WCAG AA):{' '}
            {accentWarning && 'el texto del botón "Guardar contacto" podría no leerse bien sobre el color de acento. '}
            {primaryWarning && 'los íconos podrían no verse bien con el color primario sobre un fondo claro.'}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="layout" className="text-sm font-medium">
            Layout
          </label>
          <select
            id="layout"
            name="layout"
            disabled={!canEdit}
            defaultValue={fields.layout}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            {LAYOUT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="border_radius" className="text-sm font-medium">
            Radio de bordes
          </label>
          <select
            id="border_radius"
            name="border_radius"
            disabled={!canEdit}
            defaultValue={fields.border_radius}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            {BORDER_RADIUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="font" className="text-sm font-medium">
            Tipografía
          </label>
          <select
            id="font"
            name="font"
            disabled={!canEdit}
            defaultValue={fields.font}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            {FONT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="dark_background"
            disabled={!canEdit}
            defaultChecked={fields.dark_background}
          />
          Fondo oscuro
        </label>

        <div className="flex flex-col gap-1">
          <label htmlFor="is_active" className="text-sm font-medium">
            Estado
          </label>
          <select
            id="is_active"
            name="is_active"
            disabled={!canEdit}
            defaultValue={theme.is_active ? 'true' : 'false'}
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500 disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            <option value="true">Activo (aparece al crear un perfil nuevo)</option>
            <option value="false">Inactivo</option>
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
    </main>
  )
}
