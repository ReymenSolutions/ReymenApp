import { createServerClient, type SetAllCookies } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

/**
 * Cliente de Supabase para Server Components / Route Handlers / Server
 * Actions. Lee y escribe la sesión desde las cookies de Next.js. Sigue
 * usando la anon key — el rol efectivo lo da la sesión (o ninguna, en
 * apps/public), nunca esta función.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Se puede ignorar si createClient() se llama desde un Server
            // Component puro (no puede escribir cookies); el middleware de
            // apps/admin (Fase 4) se encarga de refrescar la sesión ahí.
          }
        },
      },
    }
  )
}
