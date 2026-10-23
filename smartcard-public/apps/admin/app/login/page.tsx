import Link from 'next/link'
import { login } from './actions'
import { InviteFragmentHandler } from './InviteFragmentHandler'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  inactive: 'Esta cuenta no tiene acceso activo. Contacta a un SUPERADMIN.',
  invite_link: 'El enlace de invitación no es válido o ya expiró.',
  recovery_link: 'El enlace para restablecer tu contraseña no es válido o ya expiró. Pide uno nuevo.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <InviteFragmentHandler />
      <div>
        <h1 className="text-xl font-semibold">REYMEN Solutions — SmartCard Admin</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Acceso restringido. Sin registro público: si no tienes cuenta, pide una invitación a un
          SUPERADMIN.
        </p>
      </div>

      {message && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {message}
        </p>
      )}

      <form action={login} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next ?? ''} />

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">
            Correo
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Entrar
        </button>
      </form>

      <Link href="/forgot-password" className="text-sm text-neutral-500 hover:underline">
        ¿Olvidaste tu contraseña?
      </Link>
    </main>
  )
}
