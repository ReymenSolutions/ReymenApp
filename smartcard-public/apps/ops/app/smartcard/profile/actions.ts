'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { resolveEntitlements, hasPermission } from '@reymen/entitlements'
import { getCurrentCompanyUser } from '../../../lib/current-company-user'
import { describeSaveError } from '../../../lib/db-errors'
import { toPublicStorageUrl } from '../../../lib/public-storage-url'

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

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

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim() || null
}

/**
 * Crea o actualiza EL perfil digital de la empresa (Fase 2, autoservicio --
 * REYMEN_OPS_PLAN.md). Campos acotados a "contacto + tema básico" (alcance
 * confirmado para esta ronda): nada de theme_id (el theme base lo sigue
 * asignando REYMEN desde apps/admin), is_noindex ni status -- esos siguen
 * siendo decisiones de staff interno, no de autoservicio.
 *
 * Sin `id` en el formulario -> INSERT (primer perfil de esta empresa). Con
 * `id` -> UPDATE. RLS (profiles_company_insert/update,
 * 20261006120001_ops_smartcard_access.sql) exige smartcard.manage y que el
 * client_id sea el de esta empresa en ambos casos -- esto es la primera
 * capa, no la única.
 */
export async function upsertProfileAction(formData: FormData) {
  const { user, supabase } = await requireSmartcardManage()

  const id = str(formData, 'id')
  const slug = String(formData.get('slug') ?? '').trim().toLowerCase()
  const display_name = String(formData.get('display_name') ?? '').trim()

  if (!slug || !display_name) {
    redirect(`/smartcard/profile?error=missing_fields`)
  }

  const primary_color = String(formData.get('primary_color') ?? '').trim()
  const accent_color = String(formData.get('accent_color') ?? '').trim()
  const theme_overrides: Record<string, string> = {}
  if (HEX_COLOR.test(primary_color)) theme_overrides.primary_color = primary_color
  if (HEX_COLOR.test(accent_color)) theme_overrides.accent_color = accent_color

  const basePayload = {
    slug,
    display_name,
    first_name: str(formData, 'first_name'),
    last_name: str(formData, 'last_name'),
    job_title: str(formData, 'job_title'),
    bio: str(formData, 'bio'),
    phone: str(formData, 'phone'),
    whatsapp: str(formData, 'whatsapp'),
    email: str(formData, 'email'),
    website: str(formData, 'website'),
    address: str(formData, 'address'),
    maps_url: str(formData, 'maps_url'),
    instagram: str(formData, 'instagram'),
    facebook: str(formData, 'facebook'),
    linkedin: str(formData, 'linkedin'),
    tiktok: str(formData, 'tiktok'),
    youtube: str(formData, 'youtube'),
    theme_overrides,
  }

  if (id) {
    const { error } = await supabase.from('profiles').update(basePayload).eq('id', id)
    if (error) {
      console.error('[ops/smartcard/profile] update falló:', error.message)
      redirect(`/smartcard/profile?error=${describeSaveError(error)}`)
    }
  } else {
    // Resuelve el client_id de esta empresa (clients_company_select,
    // lectura mínima -- ver el comentario de esa policy). company<->client
    // es 1:1 en la práctica desde el backfill de Fase 1; se toma el primero.
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('company_id', user.companyId)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!client) {
      redirect(`/smartcard/profile?error=save_failed`)
    }

    const { error } = await supabase
      .from('profiles')
      .insert({ ...basePayload, client_id: client!.id })

    if (error) {
      console.error('[ops/smartcard/profile] insert falló:', error.message)
      redirect(`/smartcard/profile?error=${describeSaveError(error)}`)
    }
  }

  revalidatePath('/smartcard')
  revalidatePath('/smartcard/profile')
  redirect('/smartcard/profile?saved=1')
}

// ---------------------------------------------------------------------------
// Foto/logo -- mismo mecanismo que apps/admin/app/profiles/[id]/media-actions.ts
// (Fase 14/16: bucket profile-media, upsert en path determinista
// `{profileId}/photo|logo`, valida tipo real por magic bytes, no solo
// file.type). RLS de Storage para company_users ya está en
// 20261006120001_ops_smartcard_access.sql.
// ---------------------------------------------------------------------------

const BUCKET = 'profile-media'
const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

type MediaKind = 'photo' | 'logo'

function detectImageMimeType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

export async function uploadProfileMediaAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const kind = String(formData.get('kind') ?? '') as MediaKind
  if (!id || (kind !== 'photo' && kind !== 'logo')) redirect('/smartcard/profile')

  const { supabase } = await requireSmartcardManage()

  const errorParam = kind === 'photo' ? 'photo_invalid' : 'logo_invalid'
  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    redirect(`/smartcard/profile?error=${kind}_missing`)
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    redirect(`/smartcard/profile?error=${errorParam}`)
  }
  if (file.size > MAX_BYTES) {
    redirect(`/smartcard/profile?error=${kind}_too_big`)
  }

  const path = `${id}/${kind}`
  const bytes = await file.arrayBuffer()

  const detectedType = detectImageMimeType(new Uint8Array(bytes))
  if (!detectedType || detectedType !== file.type) {
    console.error('[ops/smartcard/profile] tipo declarado no coincide con el contenido real:', {
      declared: file.type,
      detected: detectedType,
    })
    redirect(`/smartcard/profile?error=${errorParam}`)
  }

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  })

  if (uploadError) {
    console.error('[ops/smartcard/profile] upload falló:', uploadError.message)
    redirect(`/smartcard/profile?error=${kind}_upload_failed`)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  const cacheBustedUrl = `${toPublicStorageUrl(publicUrl)}?v=${Date.now()}`

  const { error: dbError } =
    kind === 'photo'
      ? await supabase.from('profiles').update({ photo_url: cacheBustedUrl }).eq('id', id)
      : await supabase.from('profiles').update({ logo_url: cacheBustedUrl }).eq('id', id)

  if (dbError) {
    redirect(`/smartcard/profile?error=save_failed`)
  }

  revalidatePath('/smartcard/profile')
  redirect('/smartcard/profile?saved=1')
}
