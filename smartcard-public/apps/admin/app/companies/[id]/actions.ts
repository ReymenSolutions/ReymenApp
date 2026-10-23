'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { logAdminAction } from '../../../lib/audit'

type CompanyStatus = 'trial' | 'active' | 'past_due' | 'suspended' | 'cancelled'
const STATUS_VALUES: readonly CompanyStatus[] = [
  'trial',
  'active',
  'past_due',
  'suspended',
  'cancelled',
]

export async function updateCompanyAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/companies')

  const admin = await getCurrentAdmin()
  if (!admin || (admin.role !== 'SUPERADMIN' && admin.role !== 'ADMIN')) {
    redirect(`/companies/${id}?error=forbidden`)
  }

  const name = String(formData.get('name') ?? '').trim()
  const slug = String(formData.get('slug') ?? '').trim()
  const industry = String(formData.get('industry') ?? '').trim() || null
  const billing_email = String(formData.get('billing_email') ?? '').trim() || null
  const timezone = String(formData.get('timezone') ?? '').trim() || 'America/Mexico_City'
  const statusRaw = String(formData.get('status') ?? '')
  const status: CompanyStatus = (STATUS_VALUES as readonly string[]).includes(statusRaw)
    ? (statusRaw as CompanyStatus)
    : 'trial'

  if (!name) {
    redirect(`/companies/${id}?error=missing_name`)
  }
  if (!slug) {
    redirect(`/companies/${id}?error=missing_slug`)
  }

  const supabase = await createServerSupabaseClient()

  // external_org_id NO se toca aquí a propósito -- tiene su propia acción
  // (setExternalOrgIdAction) porque su regla de negocio es distinta: solo
  // vincula/desvincula, nunca se "edita" junto con el resto del formulario,
  // y así el trigger trg_companies_protect_external_org_id (que ya lo
  // protege a nivel de base de datos contra un owner/admin de la company)
  // nunca ve un UPDATE de este campo mezclado con otros cambios.
  const { data: before } = await supabase
    .from('companies')
    .select('name, slug, industry, billing_email, timezone, status')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('companies')
    .update({ name, slug, industry, billing_email, timezone, status })
    .eq('id', id)

  if (error) {
    // slug unique -- el único conflicto esperable aquí además de un fallo
    // genérico de guardado.
    if (error.code === '23505') {
      redirect(`/companies/${id}?error=slug_taken`)
    }
    redirect(`/companies/${id}?error=save_failed`)
  }

  await logAdminAction(supabase, {
    action: 'company.updated',
    entity_type: 'company',
    entity_id: id,
    before_data: before ?? null,
    after_data: { name, slug, industry, billing_email, timezone, status },
  })

  revalidatePath('/companies')
  revalidatePath(`/companies/${id}`)
  redirect(`/companies/${id}?saved=1`)
}

/**
 * Vincula (o desvincula, con external_org_id vacío) esta company con una
 * organización de Reymen-AI-OPS-Platform -- el puente del SSO de SmartCard.
 * Acción separada de updateCompanyAction por diseño (ver comentario arriba).
 * El trigger trg_companies_protect_external_org_id es la defensa real (deja
 * pasar esto porque admin_profiles SI tiene current_admin_role() no-null) --
 * el chequeo de rol de aquí es la primera capa, no la única.
 */
export async function setExternalOrgIdAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/companies')

  const admin = await getCurrentAdmin()
  if (!admin || (admin.role !== 'SUPERADMIN' && admin.role !== 'ADMIN')) {
    redirect(`/companies/${id}?error=forbidden`)
  }

  const external_org_id = String(formData.get('external_org_id') ?? '').trim() || null

  const supabase = await createServerSupabaseClient()

  const { data: before } = await supabase
    .from('companies')
    .select('external_org_id')
    .eq('id', id)
    .single()

  const { error } = await supabase.from('companies').update({ external_org_id }).eq('id', id)

  if (error) {
    if (error.code === '23505') {
      redirect(`/companies/${id}?error=org_id_taken`)
    }
    redirect(`/companies/${id}?error=save_failed`)
  }

  await logAdminAction(supabase, {
    action: external_org_id ? 'company.smartcard_sso_linked' : 'company.smartcard_sso_unlinked',
    entity_type: 'company',
    entity_id: id,
    before_data: before ?? null,
    after_data: { external_org_id },
  })

  revalidatePath('/companies')
  revalidatePath(`/companies/${id}`)
  redirect(`/companies/${id}?saved=1`)
}
