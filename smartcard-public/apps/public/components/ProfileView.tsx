import type { PublicProfile } from '@reymen/database'
import { mergeThemeConfig, contrastRatio } from '@reymen/lib'
import {
  IconPhone,
  IconWhatsapp,
  IconMail,
  IconGlobe,
  IconMapPin,
  IconChevronRight,
  IconContactCard,
  IconInstagram,
  IconFacebook,
  IconLinkedin,
  IconTiktok,
  IconYoutube,
  IconStar,
  IconCart,
  IconMercadoLibre,
} from './icons'

// Fase 17.1: `link.icon` (profile_links.icon, whitelist en
// supabase/migrations/20260912120003_profile_link_icon_whitelist.sql y en
// packages/lib/src/link-icons.ts) elige qué ícono pintar en la lista de
// "Enlaces" -- antes siempre era IconGlobe sin importar el link. Un valor
// nulo, vacío o que no calce con ninguna clave (link viejo de antes de esta
// fase, o dato corrupto) cae al genérico -- nunca debe tumbar el render.
const LINK_ICON_COMPONENTS: Record<string, (props: { size?: number; color?: string }) => React.ReactNode> = {
  instagram: IconInstagram,
  facebook: IconFacebook,
  tiktok: IconTiktok,
  youtube: IconYoutube,
  linkedin: IconLinkedin,
  whatsapp: IconWhatsapp,
  reviews: IconStar,
  phone: IconPhone,
  email: IconMail,
  maps: IconMapPin,
  mercadolibre: IconMercadoLibre,
  shopping: IconCart,
}

function resolveLinkIcon(icon: string | null, size: number, color: string) {
  const Component = (icon && LINK_ICON_COMPONENTS[icon]) || IconGlobe
  return <Component size={size} color={color} />
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Landing público de un perfil digital (Fase 11) -- la misma pieza se
 * renderiza sin importar si se llegó por /{slug}, /n/{code} o /q/{code}
 * (ARCHITECTURE.md sección 98: "rewrite, no redirect", para no perder un
 * round-trip ni duplicar contenido a ojos de buscadores). El diseño sigue
 * de cerca el bosquejo aprobado antes de esta fase (mismo hero con formas
 * decorativas, avatar circular superpuesto, botones de contacto redondos,
 * CTA de guardar contacto, lista de links tipo linktree, iconos sociales y
 * tarjeta de ubicación) -- aquí con datos reales en vez de los de ejemplo.
 *
 * Todos los botones de contacto/social y cada link de la lista pasan por
 * una ruta propia (`/c/{slug}/{kind}`, `/l/{linkId}`) en vez de un href
 * directo -- son las que registran el clic en `events` del lado servidor y
 * luego redirigen, así que no hace falta JavaScript de cliente para nada de
 * esto (ver FASE11.md sección 3).
 */
export function ProfileView({
  profile,
  slug,
  source = 'DIRECT',
}: {
  profile: PublicProfile
  slug: string
  source?: 'NFC' | 'QR' | 'DIRECT'
}) {
  // Se re-manda como query string a las rutas de clic (/c, /l) para que un
  // clic hecho dentro de una sesión que llegó por NFC/QR se cuente con ese
  // mismo origen en `events`, en vez de caer siempre a DIRECT solo porque
  // el clic en sí es una petición nueva y sin sesión.
  const srcParam = source === 'DIRECT' ? '' : `?src=${source}`
  const tokens = mergeThemeConfig(profile.theme.config, profile.theme.overrides)
  // Con fondo propio (background_color) se decide claro/oscuro por contraste y los
  // demás tonos (texto, bordes, chips) se derivan de ese color; sin él, los del tema.
  const customBg = tokens.background_color
  const isDark = customBg
    ? (contrastRatio(customBg, '#FFFFFF') ?? 0) > (contrastRatio(customBg, '#000000') ?? 0)
    : tokens.dark_background
  const cardBg = customBg ?? (isDark ? '#1A1D18' : '#FBF6EF')
  const textPrimary = isDark ? '#F3F1EA' : '#242821'
  const textMuted = isDark ? '#A9AFA2' : '#52594B'
  const cardBorder = customBg ? `color-mix(in srgb, ${cardBg} 85%, ${textPrimary})` : isDark ? '#2E322A' : '#ECE1D2'
  const chipBg = customBg ? (isDark ? `color-mix(in srgb, ${cardBg} 92%, #FFFFFF)` : `color-mix(in srgb, ${cardBg} 40%, #FFFFFF)`) : isDark ? '#20241D' : '#FFFFFF'
  // Panel de fondo detrás del avatar -- va SOLO hasta la mitad del avatar
  // (ver `heroHeight`/`marginTop` más abajo: el avatar queda montado justo
  // en el borde de abajo), no una franja alta con formas decorativas como en
  // versiones anteriores de esta pantalla -- eso ya se probó con datos
  // reales y se sintió como "un cuadro" fuera de lugar, sobre todo en el
  // theme oscuro. `primary_color` sirve de relleno cuando el theme es claro;
  // en un theme oscuro se usa `accent_color` en su lugar, porque ahí
  // `primary_color` está pensado para teñir íconos sobre chips oscuros
  // (llega a ser blanco puro), no para rellenar un panel grande.
  const heroBg = isDark ? tokens.accent_color : tokens.primary_color
  const heroHeight = 96
  const avatarSize = 112

  const contactButtons = [
    profile.phone && { kind: 'call', label: 'Llamar', icon: <IconPhone size={19} color={tokens.primary_color} /> },
    profile.whatsapp && { kind: 'whatsapp', label: 'WhatsApp', icon: <IconWhatsapp size={19} color={tokens.primary_color} /> },
    profile.email && { kind: 'email', label: 'Correo', icon: <IconMail size={19} color={tokens.primary_color} /> },
  ].filter(Boolean) as { kind: string; label: string; icon: React.ReactNode }[]

  const socials = [
    profile.instagram && { kind: 'instagram', icon: <IconInstagram size={16} color={tokens.primary_color} /> },
    profile.facebook && { kind: 'facebook', icon: <IconFacebook size={16} color={tokens.primary_color} /> },
    profile.linkedin && { kind: 'linkedin', icon: <IconLinkedin size={16} color={tokens.primary_color} /> },
    profile.tiktok && { kind: 'tiktok', icon: <IconTiktok size={16} color={tokens.primary_color} /> },
    profile.youtube && { kind: 'youtube', icon: <IconYoutube size={16} color={tokens.primary_color} /> },
  ].filter(Boolean) as { kind: string; icon: React.ReactNode }[]

  const hasLocation = !!(profile.address || profile.maps_url)
  // Productos (type = 'product') van en su propia sección, como tarjetas con
  // foto y precio; el resto sigue en "Enlaces". Los dos pasan por /l/{id}.
  const products = profile.links.filter((l) => l.type === 'product')
  const links = profile.links.filter((l) => l.type !== 'product')

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100dvh',
        background: cardBg,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
      }}
    >
      {/* Panel de fondo -- `position: absolute` + `zIndex: 0`, no un div
          normal antes del avatar en el documento. Antes dependía de que el
          avatar (más abajo, con `marginTop` negativo) "ganara" por ir
          después en el documento -- en teoría eso ya lo pinta encima, pero
          en la práctica, en Safari de iPhone, el contenido del avatar se
          seguía viendo tapado por este panel. Con posición absoluta y
          z-index explícito no depende de ningún orden ni de ninguna regla
          implícita de pintado -- este panel SIEMPRE queda detrás, sin
          ambigüedad, sin importar el navegador.

          Color sólido (`heroBg`), no degradado -- el degradado fue un
          intento de que no se leyera como "una caja" sin tocar el tamaño,
          pero el pedido real era más simple: color fuerte, no difuminado. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: heroHeight,
          background: heroBg,
          zIndex: 0,
        }}
      >
        {profile.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.logo_url}
            alt=""
            style={{ position: 'absolute', top: 16, left: 16, height: 28, opacity: 0.92 }}
          />
        )}
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: `${heroHeight - avatarSize / 2}px 24px 44px`,
        }}
      >
        {/* Avatar */}
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 9999,
            background: cardBg,
            padding: 4,
            boxShadow: '0 10px 26px rgba(27,67,50,0.28)',
            flexShrink: 0,
          }}
        >
          {profile.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.photo_url}
              alt={profile.display_name}
              style={{ width: '100%', height: '100%', borderRadius: 9999, objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: 9999,
                background: `linear-gradient(135deg, ${tokens.accent_color}, #EDD3B2)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 34, fontWeight: 800, color: tokens.primary_color, letterSpacing: '-0.02em' }}>
                {initials(profile.display_name)}
              </span>
            </div>
          )}
        </div>

        {/* Identidad */}
        <div style={{ marginTop: 18, textAlign: 'center' }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: textPrimary, letterSpacing: '-0.015em' }}>
            {profile.display_name}
          </h1>
          {profile.job_title && (
            <p style={{ margin: '7px 0 0', fontSize: 14, fontWeight: 700, color: tokens.accent_color }}>
              {profile.job_title}
            </p>
          )}
          {profile.company && (
            <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 500, color: textMuted }}>{profile.company}</p>
          )}
        </div>

        {profile.bio && (
          <p style={{ margin: '16px 0 0', fontSize: 14, lineHeight: 1.55, color: textMuted, textAlign: 'center', maxWidth: 290 }}>
            {profile.bio}
          </p>
        )}

        {/* Contacto */}
        {contactButtons.length > 0 && (
          <div style={{ display: 'flex', gap: 18, marginTop: 26 }}>
            {contactButtons.map((btn) => (
              <a
                key={btn.kind}
                href={`/c/${slug}/${btn.kind}${srcParam}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 64, textDecoration: 'none' }}
              >
                <span
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 9999,
                    background: chipBg,
                    border: `1.5px solid ${cardBorder}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(38,41,33,0.06)',
                  }}
                >
                  {btn.icon}
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, color: textMuted }}>{btn.label}</span>
              </a>
            ))}
          </div>
        )}

        {/* Guardar contacto */}
        <a
          href={`/api/vcard/${slug}`}
          style={{
            marginTop: 16,
            width: '100%',
            height: 52,
            borderRadius: 9999,
            background: tokens.accent_color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            textDecoration: 'none',
            boxShadow: `0 8px 18px color-mix(in srgb, ${tokens.accent_color} 45%, transparent)`,
          }}
        >
          <IconContactCard size={18} color="#262922" />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#262922' }}>Guardar contacto</span>
        </a>

        {/* Links */}
        {links.length > 0 && (
          <div style={{ width: '100%', marginTop: 34 }}>
            <p style={{ margin: '0 0 12px 4px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: textMuted }}>
              Enlaces
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {links.map((link) => (
                <a
                  key={link.id}
                  href={`/l/${link.id}${srcParam}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '14px 16px',
                    background: chipBg,
                    border: `1px solid ${cardBorder}`,
                    borderRadius: 20,
                    textDecoration: 'none',
                  }}
                >
                  <span
                    style={{
                      width: 40,
                      height: 40,
                      flexShrink: 0,
                      borderRadius: 9999,
                      background: `color-mix(in srgb, ${tokens.accent_color} 20%, ${chipBg})`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {resolveLinkIcon(link.icon, 18, tokens.primary_color)}
                  </span>
                  <span style={{ flexGrow: 1, fontSize: 14, fontWeight: 600, color: textPrimary }}>{link.title}</span>
                  <IconChevronRight size={16} color="#B7BDAF" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Productos */}
        {products.length > 0 && (
          <div style={{ width: '100%', marginTop: 34 }}>
            <p style={{ margin: '0 0 12px 4px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: textMuted }}>
              Productos
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: products.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 12 }}>
              {products.map((p) => (
                <a
                  key={p.id}
                  href={`/l/${p.id}${srcParam}`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    background: chipBg,
                    border: `1px solid ${cardBorder}`,
                    borderRadius: 20,
                    overflow: 'hidden',
                    textDecoration: 'none',
                  }}
                >
                  {p.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image_url}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block', background: cardBorder }}
                    />
                  ) : (
                    <span
                      style={{
                        width: '100%',
                        aspectRatio: '4 / 3',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: `color-mix(in srgb, ${tokens.accent_color} 18%, ${chipBg})`,
                      }}
                    >
                      <IconGlobe size={22} color={tokens.primary_color} />
                    </span>
                  )}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '10px 12px 12px' }}>
                    {p.price_label && <span style={{ fontSize: 15, fontWeight: 800, color: textPrimary }}>{p.price_label}</span>}
                    <span style={{ fontSize: 13, fontWeight: 600, color: textPrimary, lineHeight: 1.3 }}>{p.title}</span>
                    {p.subtitle && <span style={{ fontSize: 12, color: textMuted, lineHeight: 1.3 }}>{p.subtitle}</span>}
                    <span style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: tokens.primary_color, display: 'flex', alignItems: 'center', gap: 4 }}>
                      Ver detalles <IconChevronRight size={12} color={tokens.primary_color} />
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Redes sociales */}
        {socials.length > 0 && (
          <div style={{ display: 'flex', gap: 14, marginTop: 30 }}>
            {socials.map((s) => (
              <a
                key={s.kind}
                href={`/c/${slug}/${s.kind}${srcParam}`}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 9999,
                  background: chipBg,
                  border: `1.5px solid ${cardBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none',
                }}
              >
                {s.icon}
              </a>
            ))}
          </div>
        )}

        {/* Ubicación */}
        {hasLocation && (
          <a
            href={`/c/${slug}/maps${srcParam}`}
            style={{
              width: '100%',
              marginTop: 26,
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 16px',
              background: chipBg,
              border: `1px solid ${cardBorder}`,
              borderRadius: 20,
              textDecoration: 'none',
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: 9999,
                background: `color-mix(in srgb, ${tokens.accent_color} 20%, ${chipBg})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconMapPin size={18} color={tokens.primary_color} />
            </span>
            <span style={{ flexGrow: 1 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: textPrimary }}>
                {profile.address ?? 'Ver ubicación'}
              </span>
              <span style={{ display: 'block', fontSize: 12, color: textMuted, marginTop: 2 }}>Toca para abrir en Maps</span>
            </span>
            <IconChevronRight size={16} color="#B7BDAF" />
          </a>
        )}

        {/* Footer */}
        <div style={{ marginTop: 38, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <p style={{ margin: 0, opacity: 0.55, fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: textMuted }}>
            Creado con REYMEN SmartCard
          </p>
          {/* Fase 17: único link de esta pantalla que no es contacto/social/
              enlace del propio perfil -- por eso va aparte, discreto, no
              como un chip más de la lista de arriba. Lleva el slug para que
              quien reciba el reporte sepa de qué tarjeta vino sin tener que
              preguntarlo. */}
          <a
            href={`/feedback?slug=${slug}`}
            style={{ fontSize: 11, color: textMuted, textDecoration: 'underline', opacity: 0.7 }}
          >
            ¿Algo no se ve bien? Repórtalo
          </a>
        </div>
      </div>
    </div>
  )
}
