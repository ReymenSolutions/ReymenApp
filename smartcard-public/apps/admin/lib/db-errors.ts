/**
 * Traduce errores de Postgres/PostgREST a mensajes que un humano pueda leer,
 * sin exponer el mensaje crudo de la base de datos en la URL. Se usa en las
 * Server Actions de `profiles` y `cards` -- varias reglas de negocio de esas
 * tablas (slug único entre activos, formato de slug, slugs reservados,
 * destino de tarjeta coherente con su tipo) viven como constraints/triggers
 * en SQL, no en el código de la app (ver DATABASE.md sección 2 y las
 * migraciones de profiles/cards/functions_and_triggers), así que el error
 * real solo se conoce hasta que Postgres lo rechaza.
 *
 * Los códigos devueltos son genéricos (no cada tabla tiene su propio set) --
 * cada página define su propio ERROR_MESSAGES con el texto correcto para su
 * contexto, usando las mismas claves.
 */
export function describeSaveError(error: { message: string; code?: string } | null): string {
  if (!error) return 'save_failed'

  // 23505 = unique_violation. El único índice único parcial relevante aquí
  // es idx_profiles_slug_active (slug único entre perfiles no borrados).
  if (error.code === '23505') return 'slug_taken'

  // 23514 = check_violation (formato del slug, una URL sin http(s)://, etc.)
  // P0001 = excepción propia lanzada por un trigger (prevent_reserved_slug()
  // o validate_card_destination()) -- todas se resuelven pidiendo un valor
  // distinto o coherente.
  if (error.code === '23514' || error.code === 'P0001') {
    if (/requiere profile_id/.test(error.message)) return 'card_needs_profile'
    if (/no debe tener profile_id/.test(error.message)) return 'card_no_profile_allowed'
    if (/requiere destination_url/.test(error.message)) return 'card_needs_url'
    if (/no debe tener destination_url/.test(error.message)) return 'card_no_url_allowed'
    if (/url/i.test(error.message)) return 'link_url_invalid'
    return 'slug_invalid'
  }

  return 'save_failed'
}

/**
 * Traduce errores del Auth Admin API de Supabase (`auth.admin.inviteUserByEmail`,
 * usado en `/users/new`) -- son `AuthError` de GoTrue, no errores de Postgres,
 * así que no tienen `code` como los de arriba y hay que reconocerlos por el
 * texto del mensaje. El caso real que se documentó al probar esto (AUTH.md
 * sección 9, punto 6): reinvitar un correo que ya tiene cuenta falla con
 * "A user with this email address has already been registered" -- Supabase
 * no ofrece un código de error específico para eso en este endpoint.
 */
export function describeInviteError(error: { message: string } | null): string {
  if (!error) return 'invite_failed'
  if (/already.*registered/i.test(error.message)) return 'email_already_registered'
  if (/invalid/i.test(error.message) && /email/i.test(error.message)) return 'invalid_email'
  return 'invite_failed'
}
