'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@reymen/database'
import { logAdminAction } from '../../../lib/audit'
import { toPublicStorageUrl } from '../../../lib/public-storage-url'
import { requireEditor } from './actions'

const BUCKET = 'profile-media'
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB -- mismo límite que allowed_mime_types/file_size_limit del bucket (migración 20260910120001)
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

type MediaKind = 'photo' | 'logo'

function urlColumn(kind: MediaKind): 'photo_url' | 'logo_url' {
  return kind === 'photo' ? 'photo_url' : 'logo_url'
}

/**
 * Fase 16: hasta ahora solo se validaba `file.type`, que es un dato que
 * declara el propio navegador a partir de la extensión/metadata del
 * archivo que el usuario eligió -- nada impide que alguien suba un archivo
 * renombrado (ej. un .html o .svg con script embebido, guardado como
 * "foto.png") y que el navegador lo mande como si fuera
 * `image/png` sin que su contenido real lo sea. Esto inspecciona los
 * primeros bytes del archivo (la "firma"/magic bytes) para confirmar que
 * de verdad es el formato que dice ser, antes de subirlo al bucket público.
 */
function detectImageMimeType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }

  return null
}

/**
 * Sube una foto o un logo para un perfil.
 *
 * Ruta determinista SIN extensión (`{profileId}/photo` / `{profileId}/logo`,
 * `upsert: true`) a propósito -- así una segunda subida siempre reemplaza el
 * mismo objeto en vez de dejar el archivo viejo huérfano en el bucket. El
 * tipo de contenido correcto lo guarda Storage a partir del `contentType`
 * que se manda aquí, no depende de que la URL termine en .jpg/.png -- por
 * eso no hace falta extensión para que el navegador la muestre bien.
 */
export async function uploadProfileMediaAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const kind = String(formData.get('kind') ?? '') as MediaKind
  if (!id || (kind !== 'photo' && kind !== 'logo')) redirect('/profiles')
  await requireEditor(id)

  const errorParam = kind === 'photo' ? 'photo_invalid' : 'logo_invalid'
  const file = formData.get('file')

  if (!(file instanceof File) || file.size === 0) {
    redirect(`/profiles/${id}?error=${kind}_missing`)
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    redirect(`/profiles/${id}?error=${errorParam}`)
  }

  if (file.size > MAX_BYTES) {
    redirect(`/profiles/${id}?error=${kind}_too_big`)
  }

  const path = `${id}/${kind}`
  const bytes = await file.arrayBuffer()

  // Fase 16: confirma que el contenido real coincide con lo que el
  // navegador declaró en file.type (ver comentario de detectImageMimeType
  // arriba) -- se compara contra ese mismo file.type, no solo contra
  // ALLOWED_TYPES, para que un PNG subido como si fuera JPEG (tipo
  // declarado válido, pero distinto al contenido real) también se rechace.
  const detectedType = detectImageMimeType(new Uint8Array(bytes))
  if (!detectedType || detectedType !== file.type) {
    console.error('[profile-media] tipo declarado no coincide con el contenido real:', {
      declared: file.type,
      detected: detectedType,
    })
    redirect(`/profiles/${id}?error=${errorParam}`)
  }

  const supabase = await createServerSupabaseClient()

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  })

  if (uploadError) {
    console.error('[profile-media] upload falló:', uploadError.message)
    redirect(`/profiles/${id}?error=${kind}_upload_failed`)
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)
  // toPublicStorageUrl: si NEXT_PUBLIC_SUPABASE_STORAGE_URL está definida
  // (typicamente la IP de LAN de esta computadora), reemplaza el host
  // 127.0.0.1 por uno que un teléfono sí pueda resolver -- ver el
  // comentario de esa función. Storage sirve el mismo path para cualquier
  // subida futura (upsert) -- sin un parámetro que cambie, el navegador y
  // las redes CDN podrían quedarse con la imagen vieja en caché. Un query
  // param con la hora actual no cambia el archivo, solo obliga a pedirlo de
  // nuevo cada vez que se reemplaza.
  const cacheBustedUrl = `${toPublicStorageUrl(publicUrl)}?v=${Date.now()}`
  const column = urlColumn(kind)

  const { data: before } = await supabase.from('profiles').select(column).eq('id', id).single()

  // Ramas explícitas (no una key computada como `{ [column]: valor }`) --
  // los tipos generados de Supabase rechazan un objeto con index signature
  // genérico para .update(), aunque en runtime sea el mismo shape.
  const { error: dbError } =
    kind === 'photo'
      ? await supabase.from('profiles').update({ photo_url: cacheBustedUrl }).eq('id', id)
      : await supabase.from('profiles').update({ logo_url: cacheBustedUrl }).eq('id', id)

  if (dbError) {
    redirect(`/profiles/${id}?error=save_failed`)
  }

  await logAdminAction(supabase, {
    action: kind === 'photo' ? 'profile.photo_uploaded' : 'profile.logo_uploaded',
    entity_type: 'profile',
    entity_id: id,
    before_data: before ?? null,
    after_data: { [column]: cacheBustedUrl },
  })

  revalidatePath(`/profiles/${id}`)
  redirect(`/profiles/${id}?saved=1`)
}

/**
 * Quita la foto o el logo de un perfil: borra el objeto en Storage (no
 * dejarlo huérfano) y limpia la columna correspondiente en profiles.
 */
export async function removeProfileMediaAction(formData: FormData) {
  const id = String(formData.get('id') ?? '')
  const kind = String(formData.get('kind') ?? '') as MediaKind
  if (!id || (kind !== 'photo' && kind !== 'logo')) redirect('/profiles')
  await requireEditor(id)

  const supabase = await createServerSupabaseClient()
  const path = `${id}/${kind}`
  const column = urlColumn(kind)

  const { data: before } = await supabase.from('profiles').select(column).eq('id', id).single()

  await supabase.storage.from(BUCKET).remove([path])

  const { error: dbError } =
    kind === 'photo'
      ? await supabase.from('profiles').update({ photo_url: null }).eq('id', id)
      : await supabase.from('profiles').update({ logo_url: null }).eq('id', id)

  if (dbError) {
    redirect(`/profiles/${id}?error=save_failed`)
  }

  await logAdminAction(supabase, {
    action: kind === 'photo' ? 'profile.photo_removed' : 'profile.logo_removed',
    entity_type: 'profile',
    entity_id: id,
    before_data: before ?? null,
    after_data: { [column]: null },
  })

  revalidatePath(`/profiles/${id}`)
  redirect(`/profiles/${id}?saved=1`)
}
