import { headers } from 'next/headers'

/**
 * URL pública de apps/ops, para construir el `redirectTo` de una invitación
 * de equipo (`/settings/actions.ts`). Mismo mecanismo que
 * `apps/admin/lib/admin-url.ts` (ver ese archivo) -- `OPS_URL` si está
 * definida, si no se deriva del request; el fallback local usa el puerto
 * 3002 (el de `apps/ops`, ver package.json), no el 3001 de admin.
 */
export async function getOpsUrl(): Promise<string> {
  if (process.env.OPS_URL) return process.env.OPS_URL

  const h = await headers()
  const host = h.get('host')
  if (host) {
    const isLocal = host.startsWith('127.0.0.1') || host.startsWith('localhost')
    return `${isLocal ? 'http' : 'https'}://${host}`
  }

  return 'http://127.0.0.1:3002'
}
