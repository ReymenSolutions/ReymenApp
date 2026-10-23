// Fase 16 (seguridad): CSP estática vía next.config.js, sin nonce -- ver
// FASE16.md sección 1 para por qué (la guía oficial de esta versión de
// Next.js documenta el camino de nonce/proxy.ts, pero fuerza renderizado
// dinámico en todas las páginas y aquí no hay ningún script inline que
// justifique ese costo; `script-src 'self'` sin nonce ya es estricto de
// verdad porque no hace falta permitir nada más).
//
// Se resuelve `NEXT_PUBLIC_SUPABASE_URL` en tiempo de arranque del
// servidor (no en build time) -- `headers()` la evalúa el proceso de Next.js
// ya corriendo dentro del contenedor, donde `docker-compose.yml` ya inyectó
// la variable real vía `env_file`.
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
    // 'unsafe-inline' en style-src es deliberado, ver FASE16.md sección 1
    // (ProfileView.tsx en apps/public usa style={{...}} dinámico -- este
    // archivo es el de admin, pero se mantiene la misma política en ambas
    // apps por consistencia y porque el panel también renderiza vistas
    // previas de tema).
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
  // Fase 15 (producción): salida "standalone" -- Next.js traza exactamente
  // qué archivos y qué node_modules necesita en runtime (incluyendo
  // @reymen/database y @reymen/lib, que viven en packages/ del monorepo) y
  // los copia a .next/standalone. Sin esto, la imagen de Docker tendría que
  // llevarse todo node_modules del monorepo completo -- cientos de MB de
  // más por nada, ya que en producción no se vuelve a compilar dentro del
  // contenedor.
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
          // HSTS: TLS lo termina acme-companion (Fase 15), no Next.js --
          // este header solo hace explícito que el navegador nunca debe
          // reintentar por HTTP plano, ni siquiera si alguien escribe la
          // URL sin "https://". Sin "preload" a propósito (compromiso más
          // permanente que conviene decidir aparte si se quiere).
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Cierre defensivo: esta app no usa ninguna de estas APIs del
          // navegador, así que se deshabilitan explícitamente.
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
