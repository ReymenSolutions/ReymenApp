import { headers } from 'next/headers'

/**
 * URL pública de este panel, para construir el `redirectTo` de una
 * invitación (`/users/new/actions.ts`). Mismo mecanismo y mismo orden de
 * prioridad que `scripts/create-superadmin.mjs` (ver AUTH.md) -- primero
 * `ADMIN_URL` si está definida en el entorno -- más un paso extra que el
 * script no necesita: si no está definida, se deriva del propio request
 * (host + protocolo) en vez de asumir siempre `127.0.0.1:3001`, para que
 * funcione sin configuración adicional tanto en local como detrás de un
 * dominio real.
 */
export async function getAdminUrl(): Promise<string> {
  if (process.env.ADMIN_URL) return process.env.ADMIN_URL

  const h = await headers()
  const host = h.get('host')
  if (host) {
    const isLocal = host.startsWith('127.0.0.1') || host.startsWith('localhost')
    return `${isLocal ? 'http' : 'https'}://${host}`
  }

  return 'http://127.0.0.1:3001'
}
