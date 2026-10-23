'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { logAdminAction } from '../../../lib/audit'

/**
 * RLS (clients_insert) ya exige SUPERADMIN o ADMIN a nivel de base de datos
 * -- esta verificación aquí es para dar un error legible en vez de dejar que
 * el insert falle con "new row violates row-level security policy" y para
 * no mostrar el botón "+ Nuevo cliente" a quien de todas formas no podría
 * usarlo (defensa en profundidad, no la única capa).
 */
export async function createClientAction(formData: FormData) {
  const admin = await getCurrentAdmin()
  if (!admin || (admin.role !== 'SUPERADMIN' && admin.role !== 'ADMIN')) {
    redirect('/clients?error=forbidden')
  }

  const name = String(formData.get('name') ?? '').trim()
  const business_name = String(formData.get('business_name') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim() || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null
  const status = formData.get('status') === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'

  if (!name) {
    redirect('/clients/new?error=missing_name')
  }

  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: client, error } = await supabase
    .from('clients')
    .insert({
      name,
      business_name,
      email,
      phone,
      notes,
      status,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()

  if (error || !client) {
    redirect('/clients/new?error=save_failed')
  }

  await logAdminAction(supabase, {
    action: 'client.created',
    entity_type: 'client',
    entity_id: client.id,
    after_data: { name, business_name, email, phone, status },
  })

  revalidatePath('/clients')
  redirect(`/clients/${client.id}`)
}
