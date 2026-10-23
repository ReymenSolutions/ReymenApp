import { createHmac, timingSafeEqual } from 'crypto'

// ---------------------------------------------------------------------------
// Verificación del token de SSO que manda Reymen-AI-OPS-Platform (ese otro
// repo, Next.js/Prisma/NextAuth) cuando alguien hace click en "SmartCard"
// desde su portal. El código que FIRMA el token vive allá
// (src/lib/smartcard-sso.ts) -- este archivo es intencionalmente una copia
// del algoritmo de verificación, no un paquete compartido: los dos repos no
// comparten ningún package.json ni build, así que la alternativa (un paquete
// npm publicado solo para esto) es más infraestructura de la que amerita un
// solo endpoint. Si el algoritmo cambia, cambia en los DOS lados a la vez --
// documentado también en SMARTCARD_SSO.md.
//
// SMARTCARD_SSO_SECRET debe ser IDÉNTICO al de Reymen-AI-OPS-Platform
// (.env: SMARTCARD_SSO_SECRET) -- si no coincide, todo token se rechaza como
// bad_signature, nunca se abre una brecha "silenciosa".
// ---------------------------------------------------------------------------

const TOKEN_TTL_MS = 60 * 1000

interface SmartcardSsoPayload {
  orgId: string
  email: string
  iat: number
}

function base64UrlDecode(input: string): string | null {
  try {
    return Buffer.from(input, 'base64url').toString('utf8')
  } catch {
    return null
  }
}

function sign(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('hex')
}

function secretsMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  // timingSafeEqual exige buffers del mismo largo -- una firma de largo
  // distinto ya es inválida por definición. expected siempre mide 64 (hex de
  // sha256), así que comparamos contra un buffer de ceros del mismo largo
  // que la firma recibida para no devolver el `false` en tiempo distinto
  // según el largo que mande el atacante.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, Buffer.alloc(bufA.length))
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

export type VerifySmartcardSsoResult =
  | { ok: true; orgId: string; email: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }

export function verifySmartcardSsoToken(token: string, secret: string): VerifySmartcardSsoResult {
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [payloadB64, signature] = parts

  const expected = sign(payloadB64, secret)
  if (!secretsMatch(signature, expected)) return { ok: false, reason: 'bad_signature' }

  const decoded = base64UrlDecode(payloadB64)
  if (!decoded) return { ok: false, reason: 'malformed' }

  let payload: SmartcardSsoPayload
  try {
    payload = JSON.parse(decoded) as SmartcardSsoPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  if (!payload.orgId || !payload.email || typeof payload.iat !== 'number') {
    return { ok: false, reason: 'malformed' }
  }

  const age = Date.now() - payload.iat
  if (age > TOKEN_TTL_MS || age < -30 * 1000) return { ok: false, reason: 'expired' }

  return { ok: true, orgId: payload.orgId, email: payload.email }
}
