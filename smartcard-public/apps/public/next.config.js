// Fase 16 (seguridad): CSP estática vía next.config.js, sin nonce -- ver
// FASE16.md sección 1 para por qué (la guía oficial de esta versión de
// Next.js documenta el camino de nonce/proxy.ts, pero fuerza renderizado
// dinámico en todas las páginas -- perdiendo generación estática/ISR/cache
// de CDN en este sitio público, que sí se beneficia de eso -- y aquí no hay
// ningún script inline que justifique ese costo; `script-src 'self'` sin
// nonce ya es estricto de verdad porque no hace falta permitir nada más).
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

// Fotos de productos que REYMEN Ops agrega al perfil (profile_links con
// type = 'product', ver 20261021120001_profile_link_products.sql): se sirven
// desde la app de REYMEN Ops, no desde Supabase. Orígenes separados por
// espacio o coma; por omisión, el de producción.
function productImageOrigins() {
  const raw = process.env.PRODUCT_IMAGE_ORIGINS ?? 'https://app.reymen.mx'
  return raw
    .split(/[\s,]+/)
    .map((o) => {
      try {
        const u = new URL(o)
        return u.protocol === 'https:' ? u.origin : ''
      } catch {
        return ''
      }
    })
    .filter(Boolean)
}

function buildCsp() {
  const supabase = supabaseOrigin()
  const products = productImageOrigins().join(' ')
  return [
    `default-src 'self'`,
    `script-src 'self'`,
    // 'unsafe-inline' en style-src es deliberado: ProfileView.tsx calcula
    // style={{...}} en tiempo real a partir del tema de cada tarjeta
    // (colores, posiciones) -- theming dinámico por cliente que no se
    // puede mover a clases estáticas sin rehacer ese sistema.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:${supabase ? ` ${supabase}` : ''}${products ? ` ${products}` : ''}`,
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
  // Fase 15 (producción): salida "standalone" -- ver el comentario gemelo
  // en apps/admin/next.config.js, mismo motivo exacto (packages/database y
  // packages/lib compartidos, imagen de Docker más chica).
  output: 'standalone',
  // Headers de seguridad (sección 40 + Fase 16 completa la CSP).
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
          // reintentar por HTTP plano. Sin "preload" a propósito.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          // Cierre defensivo: este sitio no usa ninguna de estas APIs del
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
