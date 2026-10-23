'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { resolveEntitlements, hasPermission } from '@reymen/entitlements'
import { getCurrentCompanyUser } from '../../lib/current-company-user'
import { describeSaveError } from '../../lib/db-errors'

// REYMEN Ops -- Fase 2 (SmartCard autoservicio). El mismo criterio de
// permiso de toda la pantalla: smartcard.manage (owner/admin/manager la
// tienen vía role_permissions, 20260916120002; staff/agent solo
// smartcard.read, así que llegan aquí y se les rechaza). RLS
// (20261006120001_ops_smartcard_access.sql) refuerza lo mismo en la base de
// datos -- esto es la primera capa, no la única (sección 89 del prompt
// maestro: nunca confiar solo en esconder el botón en la UI).
async function requireSmartcardManage() {
  const user = await getCurrentCompanyUser()
  if (!user) redirect('/no-access')

  const supabase = await createServerSupabaseClient()
  const entitlements = await resolveEntitlements(supabase, user.companyId)

  if (!hasPermission(entitlements, 'smartcard.manage')) {
    redirect('/smartcard?error=forbidden')
  }

  return { user, supabase }
}

/**
 * Cambia a dónde manda una tarjeta cuando alguien la escanea. Arma el
 * payload a mano con solo estos 3 campos -- nunca notes/client_id/status,
 * aunque alguien manipulara el <form> del navegador para mandar más --
 * mismo patrón que updateClientAction en apps/admin (cada Server Action
 * decide exactamente qué columnas toca, no confía en lo que llegue en
 * FormData más allá de lo que lee explícitamente).
 */
export async function updateCardDestinationAction(formData: FormData) {
  const cardId = String(formData.get('card_id') ?? '')
  if (!cardId) redirect('/smartcard')

  const { supabase } = await requireSmartcardManage()

  const destination_type = String(formData.get('destination_type') ?? '').trim()
  const rawUrl = String(formData.get('destination_url') ?? '').trim()
  const rawProfileId = String(formData.get('profile_id') ?? '').trim()

  if (!destination_type) {
    redirect(`/smartcard?error=missing_fields`)
  }

  const payload = {
    destination_type,
    destination_url: rawUrl || null,
    profile_id: rawProfileId || null,
  }

  const { error } = await supabase.from('cards').update(payload).eq('id', cardId)

  if (error) {
    console.error('[ops/smartcard] no se pudo actualizar la tarjeta:', error.message)
    redirect(`/smartcard?error=${describeSaveError(error)}`)
  }

  revalidatePath('/smartcard')
  redirect('/smartcard?saved=1')
}
