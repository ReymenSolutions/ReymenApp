import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentAdmin } from '../../../../lib/current-admin'
import { AdminHeader } from '../../../../components/AdminHeader'
import { LAYOUT_OPTIONS, BORDER_RADIUS_OPTIONS, FONT_OPTIONS } from '../../../../lib/theme-config'
import { createThemeAction } from './actions'

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: 'El nombre y el slug son obligatorios.',
  invalid_config: 'Revisa los colores (formato #RRGGBB) y las opciones elegidas.',
  slug_taken: 'Ya existe un theme con ese slug. Elige uno distinto.',
  save_failed: 'No se pudo guardar el theme. Intenta de nuevo.',
  forbidden: 'No tienes permiso para crear themes.',
}

export default async function NewThemePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const admin = await getCurrentAdmin()

  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect('/settings')
  }

  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  return (
    <main className="mx-auto max-w-lg p-8">
      <AdminHeader />

      <Link href="/settings" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Volver a ajustes
      </Link>

      {message && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {message}
        </p>
      )}

      <h1 className="mb-1 text-xl font-semibold">Nuevo theme</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Solo tokens seguros (colores, tipografía, layout) -- nunca CSS libre. Ver DATABASE.md.
      </p>

      <form action={createThemeAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium">
            Nombre <span className="text-red-600">*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Ej. Boutique"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
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
            placeholder="Ej. boutique"
            pattern="[a-z0-9_]+"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
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
              defaultValue="#111111"
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
              defaultValue="#4F46E5"
              className="h-10 w-full rounded-md border border-neutral-300"
            />
          </div>
        </div>
        {/* Fase 17 (accesibilidad): recordatorio estático -- aquí todavía no
            hay un theme guardado contra el cual calcular el contraste real
            (eso sí pasa una vez creado, ver /settings y la pantalla de
            edición). */}
        <p className="-mt-2 text-xs text-neutral-400">
          El color de acento debe leerse bien con texto oscuro encima (botón
          &quot;Guardar contacto&quot;); el color primario, con íconos claros sobre un
          fondo blanco. Colores muy claros suelen fallar ese contraste --
          después de crear el theme, esta pantalla avisa si hace falta
          ajustarlo.
        </p>

        <div className="flex flex-col gap-1">
          <label htmlFor="layout" className="text-sm font-medium">
            Layout
          </label>
          <select
            id="layout"
            name="layout"
            defaultValue="minimal"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
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
            defaultValue="md"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
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
            defaultValue="inter"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          >
            {FONT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="dark_background" />
          Fondo oscuro (como el theme &quot;Dark&quot;)
        </label>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Crear theme
        </button>
      </form>
    </main>
  )
}
