import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { createAdminClient } from '@reymen/database'
import { verifySmartcardSsoToken } from '../../../../lib/smartcard-sso'
import { getOpsUrl } from '../../../../lib/ops-url'

// ---------------------------------------------------------------------------
// Punto de entrada del SSO de SmartCard. Reymen-AI-OPS-Platform (el otro
// repo) redirige aquí con `?token=...` cuando alguien con el módulo NFC_QR
// activo hace click en "SmartCard" desde su portal (src/app/(portal)/portal
// /smartcard/route.ts, allá). Nunca se le pide contraseña otra vez -- pero
// tampoco se confía ciegamente en el token: cada paso de abajo es una
// verificación real, no cosmética.
//
// Flujo:
//   1. Verificar la firma HMAC + vigencia del token (60s, un solo uso en la
//      práctica -- no hay tabla de tokens usados porque su ventana es tan
//      corta que no vale la pena esa complejidad en v1).
//   2. Resolver la company de aquí por companies.external_org_id (vínculo
//      creado a mano en REYMEN Admin -- ver apps/admin/app/companies).
//   3. Confirmar que el email del token pertenece a un company_users ACTIVO
//      de esa company específica -- nunca se crea una cuenta nueva de
//      Supabase Auth para completar esto (ver el loop de getUserById abajo);
//      si el email no es ya un miembro activo, no hay sesión, punto.
//   4. Generar un magic link para ese usuario YA EXISTENTE y canjearlo del
//      lado servidor vía /auth/confirm (mismo mecanismo que invitación /
//      recuperación -- ver el comentario de esa ruta).
//
// Todo error redirige a /login con un código legible en vez de mostrar un
// 500 o filtrar detalle técnico -- quien llega aquí nunca tuvo sesión, así
// que /login es siempre un destino válido.
// ---------------------------------------------------------------------------

function toLogin(reason: string): never {
  redirect(`/login?error=${reason}`)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) toLogin('sso_missing_token')

  const secret = process.env.SMARTCARD_SSO_SECRET
  if (!secret) {
    console.error('[api/sso/smartcard] SMARTCARD_SSO_SECRET no está definida en este entorno.')
    toLogin('sso_not_configured')
  }

  const verified = verifySmartcardSsoToken(token!, secret!)
  if (!verified.ok) {
    console.error('[api/sso/smartcard] Token inválido:', verified.reason)
    toLogin(verified.reason === 'expired' ? 'sso_expired' : 'sso_invalid')
  }

  const { orgId, email } = verified

  const adminClient = createAdminClient()

  const { data: company, error: companyError } = await adminClient
    .from('companies')
    .select('id, name')
    .eq('external_org_id', orgId)
    .maybeSingle()

  if (companyError) {
    console.error('[api/sso/smartcard] Error buscando company:', companyError.message)
    toLogin('sso_failed')
  }
  if (!company) {
    console.error('[api/sso/smartcard] Ninguna company vinculada a external_org_id:', orgId)
    toLogin('sso_no_company')
  }

  const { data: members, error: membersError } = await adminClient
    .from('company_users')
    .select('user_id')
    .eq('company_id', company!.id)
    .eq('status', 'active')

  if (membersError) {
    console.error('[api/sso/smartcard] Error listando company_users:', membersError.message)
    toLogin('sso_failed')
  }

  // No hay forma soportada de buscar en auth.users por email sin exponer el
  // schema `auth` en PostgREST (que no está expuesto, y no debería estarlo)
  // -- en cambio, se resuelve el email de cada miembro activo ya conocido de
  // ESTA company vía el Admin API (getUserById), y se compara. El equipo de
  // una company en Fase 1 es chico (ver plan_limits/max_team_members), así
  // que este loop nunca es un problema de rendimiento real.
  const targetEmail = email.toLowerCase()
  let matchedUserId: string | null = null

  for (const member of members ?? []) {
    const { data: userResponse } = await adminClient.auth.admin.getUserById(member.user_id)
    if (userResponse?.user?.email?.toLowerCase() === targetEmail) {
      matchedUserId = member.user_id
      break
    }
  }

  if (!matchedUserId) {
    console.error(
      '[api/sso/smartcard] Email del token no es miembro activo de la company:',
      email,
      company!.id
    )
    toLogin('sso_no_membership')
  }

  const opsUrl = await getOpsUrl()

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${opsUrl}/dashboard` },
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    console.error('[api/sso/smartcard] generateLink falló:', linkError?.message)
    toLogin('sso_failed')
  }

  const confirmUrl = new URL('/auth/confirm', opsUrl)
  confirmUrl.searchParams.set('token_hash', linkData!.properties.hashed_token)
  confirmUrl.searchParams.set('type', 'magiclink')
  confirmUrl.searchParams.set('next', '/dashboard')

  redirect(confirmUrl.toString())
}
