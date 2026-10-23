import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Cliente con service_role. SALTA TODAS LAS POLICIES DE RLS.
 *
 * Reglas (sección 20 del prompt original):
 *  - Solo se importa desde código de servidor de apps/admin (Server Actions,
 *    Route Handlers). Jamás desde un componente cliente.
 *  - Jamás desde apps/public — esa app no debe ni tener la variable de
 *    entorno SUPABASE_SERVICE_ROLE_KEY definida.
 *  - Para todo lo demás (incluida la mayoría del propio panel admin) usa el
 *    cliente de server.ts, que respeta RLS con el rol del usuario logueado.
 */
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY no está definida. Este cliente solo debe usarse en apps/admin, en el servidor.'
    )
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
