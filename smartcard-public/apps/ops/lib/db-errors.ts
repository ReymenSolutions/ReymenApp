/**
 * Mismo helper que apps/admin/lib/db-errors.ts, copiado en vez de compartido
 * vía package porque apps/ops no necesita más que esto de ahí -- no
 * justifica un paquete nuevo todavía.
 *
 * describeSaveError/describeInviteError: copia exacta de la versión de
 * apps/admin (mismos códigos, mismo criterio -- ver ese archivo para el
 * porqué completo de cada caso).
 *
 * describeMembershipError: específico de apps/ops/app/settings/actions.ts
 * (insertar en company_users al invitar a alguien). 23505 = unique_violation
 * -- choca con el índice único (company_id, user_id)
 * (20260916120003_user_profiles_and_company_users.sql): esa persona ya
 * tiene una membresía (activa o invitada) en esta empresa. 42501 =
 * insufficient_privilege -- la policy company_users_insert
 * (20260916120007_plan_limits.sql) combina el chequeo de rol (ya validado
 * en la propia Server Action antes de llegar aquí) con el de
 * max_team_members en un solo WITH CHECK; a esta altura del flujo (ya pasó
 * el pre-check de límite en la Server Action) un 42501 real solo puede ser
 * una condición de carrera sobre ese límite, así que se reporta como tal en
 * vez de un "no tienes permiso" engañoso.
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

  if (error.code === '42501') return 'forbidden'

  return 'save_failed'
}

export function describeInviteError(error: { message: string } | null): string {
  if (!error) return 'invite_failed'
  if (/already.*registered/i.test(error.message)) return 'email_already_registered'
  if (/invalid/i.test(error.message) && /email/i.test(error.message)) return 'invalid_email'
  return 'invite_failed'
}

export function describeMembershipError(error: { message: string; code?: string } | null): string {
  if (!error) return 'invite_failed'
  if (error.code === '23505') return 'already_member'
  if (error.code === '42501') return 'team_limit_reached'
  return 'invite_failed'
}
