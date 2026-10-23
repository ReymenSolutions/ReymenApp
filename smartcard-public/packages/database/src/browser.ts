import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

/**
 * Cliente de Supabase para componentes de cliente ('use client'). Usa la
 * anon key — nunca la service_role. Sujeto a RLS igual que cualquier
 * visitante anónimo o sesión de navegador.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
