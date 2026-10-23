import Link from 'next/link'
import { requestPasswordReset } from './actions'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>
}) {
  const { error, sent } = await searchParams

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">Recupera tu contraseña</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Escribe el correo con el que entras al panel. Si tiene una cuenta, te mandamos un enlace
          para crear una contraseña nueva.
        </p>
      </div>

      {sent === '1' ? (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
          Si ese correo tiene una cuenta activa, ya te mandamos las instrucciones. Revisa tu
          bandeja de entrada (y spam).
        </p>
      ) : (
        <>
          {error === 'missing_email' && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              Escribe tu correo.
            </p>
          )}

          <form action={requestPasswordReset} className="flex flex-col gap-4">
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

            <button
              type="submit"
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Enviar instrucciones
            </button>
          </form>
        </>
      )}

      <Link href="/login" className="text-sm text-neutral-500 hover:underline">
        ← Volver a iniciar sesión
      </Link>
    </main>
  )
}
