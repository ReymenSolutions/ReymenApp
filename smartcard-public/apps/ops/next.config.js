// Mismo criterio de seguridad que apps/admin/next.config.js (Fase 16) --
// CSP estática sin nonce, headers de defensa básicos. Se copia tal cual en
// vez de compartirla desde un paquete porque next.config.js no es algo que
// packages/lib pueda exportar (Next.js lo carga como CommonJS desde la
// carpeta de cada app antes de que el bundler entre en juego).

function supabaseOrigin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return ''
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

function buildCsp() {
  const supabase = supabaseOrigin()
  return [
    `default-src 'self'`,
    `script-src 'self'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:${supabase ? ` ${supabase}` : ''}`,
    `font-src 'self'`,
    `connect-src 'self'${supabase ? ` ${supabase}` : ''}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ')
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: buildCsp() },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
