/**
 * Convierte la URL pública que devuelve Supabase Storage (que usa
 * NEXT_PUBLIC_SUPABASE_URL como base -- típicamente http://127.0.0.1:54321
 * en local) a una que sí resuelve desde un teléfono en la misma red.
 *
 * Mismo problema, mismo tipo de solución que PUBLIC_SITE_URL (Fase 12) para
 * el QR: 127.0.0.1 significa "este mismo dispositivo" -- un teléfono nunca
 * puede llegar a la Supabase local de la computadora por esa IP, aunque
 * esté en el mismo WiFi.
 *
 * A propósito NO se cambia NEXT_PUBLIC_SUPABASE_URL en sí -- ese sigue
 * siendo el que usa este panel para sus propias llamadas (auth, tablas,
 * Storage), que corren desde la misma computadora donde vive Supabase y
 * nunca tienen este problema. Solo se reescribe el host de la URL que
 * termina guardada en profiles.photo_url/logo_url -- la que sí va a abrir
 * un teléfono, en apps/public.
 */
export function toPublicStorageUrl(url: string): string {
  const override = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_URL
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!override || !base || !url.startsWith(base)) return url

  return override.replace(/\/$/, '') + url.slice(base.length)
}
