import { login } from './actions'
import { PasswordField } from '../../components/PasswordField'

const ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  recovery_link: 'El enlace para restablecer tu contraseña no es válido o ya expiró. Pide uno nuevo.',
  // SmartCard SSO (api/sso/smartcard/route.ts) -- el intento de entrar desde
  // Reymen-AI-OPS-Platform no se pudo completar por alguna de estas razones;
  // en todos los casos la salida es entrar aquí con correo y contraseña
  // normales, nunca un error técnico sin explicación.
  sso_missing_token: 'El enlace de acceso desde SmartCard no es válido. Intenta de nuevo desde el portal.',
  sso_invalid: 'El enlace de acceso desde SmartCard no es válido. Intenta de nuevo desde el portal.',
  sso_expired: 'El enlace de acceso desde SmartCard ya expiró. Vuelve a intentarlo desde el portal.',
  sso_not_configured: 'El acceso directo desde SmartCard no está disponible todavía. Entra con tu correo y contraseña.',
  sso_no_company: 'Tu empresa todavía no está vinculada con SmartCard. Contacta a soporte.',
  sso_no_membership: 'Tu cuenta no tiene acceso activo a SmartCard en esta empresa. Contacta a soporte.',
  sso_link: 'El enlace de acceso desde SmartCard no es válido o ya expiró. Intenta de nuevo desde el portal.',
  sso_failed: 'No se pudo completar el acceso desde SmartCard. Intenta de nuevo o entra con tu correo y contraseña.',
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
      <div>
        <h1 className="text-xl font-semibold">REYMEN Ops</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Entra con la cuenta de tu empresa. Si no tienes una, pide una invitación al dueño de tu
          cuenta en REYMEN Ops.
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
          <PasswordField id="password" name="password" required autoComplete="current-password" />
        </div>

        <button
          type="submit"
          className="rounded-md bg-[#04275A] px-3 py-2 text-sm font-medium text-white hover:bg-[#063C82]"
        >
          Entrar
        </button>
      </form>
    </main>
  )
}
