import { setPassword } from './actions'

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; context?: string }>
}) {
  const { error, context } = await searchParams
  const message =
    error === 'mismatch'
      ? 'Las contraseñas no coinciden o son muy cortas (mínimo 8 caracteres).'
      : null
  // `context=recovery` lo agrega /auth/confirm (Fase 13) cuando el link que
  // se consumió era de "olvidé mi contraseña", no de invitación -- mismo
  // formulario para las dos, pero el mensaje real es distinto (esta
  // persona ya tenía cuenta, no es su primera vez).
  const isRecovery = context === 'recovery'

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">
          {isRecovery ? 'Restablece tu contraseña' : 'Crea tu contraseña'}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {isRecovery
            ? 'Define una contraseña nueva para tu cuenta.'
            : 'Es la primera vez que entras. Define una contraseña para tu cuenta antes de continuar.'}
        </p>
      </div>

      {message && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {message}
        </p>
      )}

      <form action={setPassword} className="flex flex-col gap-4">
        {/* Para que un error de validación regrese a esta misma pantalla
            sin perder si era de recuperación -- la Server Action solo ve
            el FormData, no la URL con la que se cargó la página. */}
        <input type="hidden" name="context" value={context ?? ''} />

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium">
            Nueva contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            Confirma la contraseña
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Guardar y continuar
        </button>
      </form>
    </main>
  )
}
