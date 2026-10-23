/**
 * Copia exacta de apps/admin/lib/public-storage-url.ts (Fase 14) -- mismo
 * motivo que db-errors.ts: un archivo, no justifica un paquete compartido
 * todavía. Ver el comentario original allá para el porqué completo.
 */
export function toPublicStorageUrl(url: string): string {
  const override = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_URL
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!override || !base || !url.startsWith(base)) return url

  return override.replace(/\/$/, '') + url.slice(base.length)
}
