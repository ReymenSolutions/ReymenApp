import type { createServerSupabaseClient, Json } from '@reymen/database'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Escribe en audit_logs a través de la función SECURITY DEFINER
 * `log_admin_action()` (supabase/migrations/20260908120001_log_admin_action.sql)
 * -- RLS no tiene ninguna policy de INSERT sobre audit_logs a propósito (ver
 * audit_logs.sql / rls_policies.sql), así que un insert directo desde aquí
 * fallaría sin importar el rol de quien esté logueado.
 *
 * Un fallo al auditar nunca debe tumbar la operación real que lo originó
 * (crear/editar/borrar un cliente ya se guardó cuando esto se llama) -- por
 * eso solo se registra en consola, no se relanza el error.
 */
export async function logAdminAction(
  supabase: SupabaseClient,
  params: {
    action: string
    entity_type: string
    entity_id?: string | null
    before_data?: Record<string, unknown> | null
    after_data?: Record<string, unknown> | null
  }
) {
  const { error } = await supabase.rpc('log_admin_action', {
    p_action: params.action,
    p_entity_type: params.entity_type,
    p_entity_id: params.entity_id ?? null,
    // Se recibe como Record<string, unknown> (más cómodo para quien llama,
    // que arma objetos planos con strings y null) y se convierte a Json aquí
    // -- estructuralmente son compatibles para lo que este código construye,
    // Json solo exige recursividad hasta el último nivel, que TS no puede
    // inferir automáticamente de un tipo genérico como unknown.
    p_before_data: (params.before_data ?? null) as Json | null,
    p_after_data: (params.after_data ?? null) as Json | null,
  })

  if (error) {
    console.error('[audit] log_admin_action falló:', error.message)
  }
}
