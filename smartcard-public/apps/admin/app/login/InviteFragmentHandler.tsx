'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
// Se importa directo desde './browser' (no desde el barrel '@reymen/database')
// a propósito: el barrel también reexporta server.ts, que depende de
// `next/headers` -- eso no puede entrar al bundle de un Client Component
// aunque el propio componente nunca lo use.
import { createClient as createBrowserSupabaseClient } from '@reymen/database/browser'

/**
 * Red de seguridad para el flujo de invitación.
 *
 * En teoría, la plantilla de correo personalizada (supabase/templates/invite.html,
 * ver AUTH.md sección 3) manda el link directo a /auth/confirm con
 * `token_hash` + `type` como query params, que sí puede leer el servidor.
 * Pero si esa plantilla no está cargada (config.toml sin el bloque
 * [auth.email.template.invite], o Supabase sin reiniciar después de
 * agregarlo), Supabase usa su plantilla por defecto: esa manda al endpoint
 * de verificación propio de Supabase, que redirige de vuelta con los tokens
 * de sesión en el FRAGMENTO de la URL (`#access_token=...`) -- el fragmento
 * nunca se manda al servidor, así que /auth/confirm no encuentra nada y
 * termina redirigiendo aquí, a /login, con ?error=invite_link (el navegador
 * conserva el fragmento original porque el destino de la redirección no
 * trae uno propio).
 *
 * Este componente corre del lado del cliente -- el único lugar donde el
 * fragmento sí es legible -- lo detecta, establece la sesión a mano con
 * `setSession`, y manda a /set-password. Así el primer login funciona sin
 * depender de que la plantilla personalizada esté cargada.
 *
 * Muestra un mensaje visible en vez de fallar en silencio -- un
 * `access_token` de un link viejo (ya expirado, o ya usado una vez) es un
 * caso esperado, y sin este mensaje no había forma de distinguirlo desde
 * afuera de "no está corriendo el código nuevo".
 */
export function InviteFragmentHandler() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'checking' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    // Log incondicional -- confirma, sin ambigüedad, que este componente sí
    // se montó y sí corrió, independientemente de lo que pase después.
    console.log('[InviteFragmentHandler] montado. hash actual:', window.location.hash)

    const hash = window.location.hash
    if (!hash || hash.length < 2) {
      console.log('[InviteFragmentHandler] sin fragmento en la URL, no hay nada que hacer.')
      return
    }

    const params = new URLSearchParams(hash.slice(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')

    console.log('[InviteFragmentHandler] parseado:', {
      hasAccessToken: Boolean(accessToken),
      hasRefreshToken: Boolean(refreshToken),
      type,
    })

    if (!accessToken || !refreshToken) {
      console.log('[InviteFragmentHandler] faltan access_token o refresh_token, no hay nada que hacer.')
      return
    }
    if (type !== 'invite' && type !== 'recovery') {
      console.log('[InviteFragmentHandler] type no es invite/recovery, no hay nada que hacer.')
      return
    }

    setStatus('checking')
    console.log('[InviteFragmentHandler] llamando a setSession...')

    const supabase = createBrowserSupabaseClient()

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          console.error('[InviteFragmentHandler] setSession falló:', error)
          setErrorMessage(error.message)
          setStatus('error')
          return
        }
        console.log('[InviteFragmentHandler] setSession OK, redirigiendo a /set-password')
        router.replace('/set-password')
      })
      .catch((err) => {
        console.error('[InviteFragmentHandler] setSession lanzó una excepción:', err)
        setErrorMessage(err instanceof Error ? err.message : String(err))
        setStatus('error')
      })
  }, [router])

  if (status === 'checking') {
    return (
      <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700" role="status">
        Verificando tu invitación...
      </p>
    )
  }

  if (status === 'error') {
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
        El link de invitación ya no es válido{errorMessage ? ` (${errorMessage})` : ''}. Pide que
        te reenvíen la invitación.
      </p>
    )
  }

  return null
}
