'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { isValidLinkIcon } from '@reymen/lib'
import { getCurrentAdmin } from '../../../lib/current-admin'
import { logAdminAction } from '../../../lib/audit'
import { describeSaveError } from '../../../lib/db-errors'

// Exportada -- media-actions.ts (Fase 14, subida de foto/logo) usa exactamente
// el mismo criterio de permiso que el resto de esta pantalla: subir un
// archivo es la misma acción que editar cualquier otro campo del perfil.
export async function requireEditor(profileId: string) {
  const admin = await getCurrentAdmin()
  if (!admin || (admin.role !== 'SUPERADMIN' && admin.role !== 'ADMIN')) {
    redirect(`/profiles/${profileId}?error=forbidden`)
  }
  return admin
}

function str(formData: FormData, key: string) {
  return String(formData.get(key) ?? '').trim() || null
}

export async function updateProfileAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/profiles')
  await requireEditor(id)

  const slug = String(formData.get('slug') ?? '')
    .trim()
    .toLowerCase()
  const display_name = String(formData.get('display_name') ?? '').trim()

  if (!slug || !display_name) {
    redirect(`/profiles/${id}?error=missing_fields`)
  }

  const supabase = await createServerSupabaseClient()

  const { data: before } = await supabase
    .from('profiles')
    .select(
      'slug, display_name, first_name, last_name, job_title, company, bio, phone, whatsapp, email, website, address, maps_url, instagram, facebook, linkedin, tiktok, youtube, photo_url, logo_url, theme_id, status, is_noindex'
    )
    .eq('id', id)
    .single()

  const payload = {
    slug,
    display_name,
    first_name: str(formData, 'first_name'),
    last_name: str(formData, 'last_name'),
    job_title: str(formData, 'job_title'),
    company: str(formData, 'company'),
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
    photo_url: str(formData, 'photo_url'),
    logo_url: str(formData, 'logo_url'),
    theme_id: str(formData, 'theme_id'),
    status: (formData.get('status') === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE') as
      | 'ACTIVE'
      | 'INACTIVE',
    is_noindex: formData.get('is_noindex') === 'on',
  }

  const { error } = await supabase.from('profiles').update(payload).eq('id', id)

  if (error) {
    redirect(`/profiles/${id}?error=${describeSaveError(error)}`)
  }

  await logAdminAction(supabase, {
    action: 'profile.updated',
    entity_type: 'profile',
    entity_id: id,
    before_data: before ?? null,
    after_data: payload,
  })

  revalidatePath('/profiles')
  revalidatePath(`/profiles/${id}`)
  redirect(`/profiles/${id}?saved=1`)
}

export async function softDeleteProfileAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/profiles')

  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect(`/profiles/${id}?error=forbidden`)
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase
    .from('profiles')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    redirect(`/profiles/${id}?error=save_failed`)
  }

  await logAdminAction(supabase, {
    action: 'profile.deleted',
    entity_type: 'profile',
    entity_id: id,
  })

  revalidatePath('/profiles')
  revalidatePath(`/profiles/${id}`)
  redirect('/profiles?deleted=1')
}

export async function reactivateProfileAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  if (!id) redirect('/profiles')

  const admin = await getCurrentAdmin()
  if (!admin || admin.role !== 'SUPERADMIN') {
    redirect(`/profiles/${id}?error=forbidden`)
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.from('profiles').update({ deleted_at: null }).eq('id', id)

  if (error) {
    redirect(`/profiles/${id}?error=save_failed`)
  }

  await logAdminAction(supabase, {
    action: 'profile.reactivated',
    entity_type: 'profile',
    entity_id: id,
  })

  revalidatePath('/profiles')
  revalidatePath(`/profiles/${id}`)
  redirect(`/profiles/${id}?saved=1`)
}

// ---------------------------------------------------------------------------
// profile_links -- gestión de los botones/links del perfil público. RLS ya
// permite SUPERADMIN+ADMIN (no solo SUPERADMIN, a diferencia de borrar un
// perfil completo -- ver rls_policies.sql, profile_links_delete). No se
// audita cada cambio de link en audit_logs a propósito (mismo criterio que
// ya fija el comentario de la tabla: "solo cambios administrativos
// relevantes, no cada clic del panel") -- el cambio relevante que sí importa
// rastrear es el del perfil mismo.
// ---------------------------------------------------------------------------

export async function addProfileLinkAction(formData: FormData) {
  const profileId = String(formData.get('profile_id') ?? '')
  if (!profileId) redirect('/profiles')
  await requireEditor(profileId)

  const title = String(formData.get('title') ?? '').trim()
  const url = String(formData.get('url') ?? '').trim()
  // Fase 17.1: ícono elegido en el <select> del formulario (packages/lib/src/link-icons.ts
  // -- LINK_ICON_OPTIONS). Un valor vacío o fuera de la whitelist cae a
  // null ("genérico"), nunca a un error -- este campo es opcional, a
  // diferencia de título/url.
  const iconRaw = String(formData.get('icon') ?? '').trim()
  const icon = isValidLinkIcon(iconRaw) ? iconRaw : null

  if (!title || !url) {
    redirect(`/profiles/${profileId}?error=link_missing_fields`)
  }

  const supabase = await createServerSupabaseClient()

  const { data: maxRow } = await supabase
    .from('profile_links')
    .select('sort_order')
    .eq('profile_id', profileId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('profile_links').insert({
    profile_id: profileId,
    title,
    url,
    icon,
    sort_order: (maxRow?.sort_order ?? -1) + 1,
  })

  if (error) {
    redirect(`/profiles/${profileId}?error=${describeSaveError(error)}`)
  }

  revalidatePath(`/profiles/${profileId}`)
  redirect(`/profiles/${profileId}?saved=1`)
}

export async function deleteProfileLinkAction(formData: FormData) {
  const profileId = String(formData.get('profile_id') ?? '')
  const linkId = String(formData.get('link_id') ?? '')
  if (!profileId || !linkId) redirect('/profiles')
  await requireEditor(profileId)

  const supabase = await createServerSupabaseClient()
  await supabase.from('profile_links').delete().eq('id', linkId)

  revalidatePath(`/profiles/${profileId}`)
  redirect(`/profiles/${profileId}`)
}

// Fase 17.1: cambiar el ícono de un link que ya existe -- no hay (ni había,
// antes de esta fase) una acción para editar título/url de un link
// existente, la convención de esta pantalla es borrar y crear de nuevo para
// eso. El ícono es distinto: el usuario pidió explícitamente poder
// corregirlo sin rehacer el link entero (ej. el de Instagram del ejemplo,
// creado antes de que existiera esta opción) -- de ahí esta acción aparte,
// acotada a un solo campo, en vez de generalizar a un editProfileLinkAction
// completo que nadie pidió todavía.
export async function updateProfileLinkIconAction(formData: FormData) {
  const profileId = String(formData.get('profile_id') ?? '')
  const linkId = String(formData.get('link_id') ?? '')
  if (!profileId || !linkId) redirect('/profiles')
  await requireEditor(profileId)

  const iconRaw = String(formData.get('icon') ?? '').trim()
  const icon = isValidLinkIcon(iconRaw) ? iconRaw : null

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('profile_links').update({ icon }).eq('id', linkId)

  if (error) {
    redirect(`/profiles/${profileId}?error=${describeSaveError(error)}`)
  }

  revalidatePath(`/profiles/${profileId}`)
  redirect(`/profiles/${profileId}?saved=1`)
}

export async function toggleProfileLinkAction(formData: FormData) {
  const profileId = String(formData.get('profile_id') ?? '')
  const linkId = String(formData.get('link_id') ?? '')
  const nextActive = formData.get('next_active') === 'true'
  if (!profileId || !linkId) redirect('/profiles')
  await requireEditor(profileId)

  const supabase = await createServerSupabaseClient()
  await supabase.from('profile_links').update({ is_active: nextActive }).eq('id', linkId)

  revalidatePath(`/profiles/${profileId}`)
  redirect(`/profiles/${profileId}`)
}

export async function moveProfileLinkAction(formData: FormData) {
  const profileId = String(formData.get('profile_id') ?? '')
  const linkId = String(formData.get('link_id') ?? '')
  const direction = String(formData.get('direction') ?? '')
  if (!profileId || !linkId) redirect('/profiles')
  await requireEditor(profileId)

  const supabase = await createServerSupabaseClient()

  const { data: links } = await supabase
    .from('profile_links')
    .select('id, sort_order')
    .eq('profile_id', profileId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (links) {
    const index = links.findIndex((l) => l.id === linkId)
    const swapIndex = direction === 'up' ? index - 1 : index + 1

    if (index !== -1 && swapIndex >= 0 && swapIndex < links.length) {
      const current = links[index]
      const neighbor = links[swapIndex]
      await supabase
        .from('profile_links')
        .update({ sort_order: neighbor.sort_order })
        .eq('id', current.id)
      await supabase
        .from('profile_links')
        .update({ sort_order: current.sort_order })
        .eq('id', neighbor.id)
    }
  }

  revalidatePath(`/profiles/${profileId}`)
  redirect(`/profiles/${profileId}`)
}
