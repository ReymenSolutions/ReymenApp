import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import type { Database } from './types'

/**
 * Cliente de Supabase para `middleware.ts` (Edge runtime de Next.js).
 *
 * No puede reusar `server.ts` (ese usa `next/headers` `cookies()`, que solo
 * funciona dentro de Server Components/Route Handlers/Server Actions) ni
 * `browser.ts` (ese no toca cookies de servidor en absoluto). El middleware
 * lee y escribe cookies directo de `NextRequest`/`NextResponse`, así que
 * este helper recibe esos callbacks como parámetros en vez de importar
 * `next/server` aquí -- `packages/database` no depende de Next.js en
 * ningún otro archivo, y no queremos que este sea la excepción.
 */
export function createMiddlewareClient(
  getAll: () => { name: string; value: string }[],
  setAll: (cookiesToSet: Parameters<SetAllCookies>[0]) => void
) {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll, setAll },
    }
  )
}
