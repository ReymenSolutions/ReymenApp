import type { Metadata } from 'next'
import { submitPublicFeedbackAction } from './actions'

export const metadata: Metadata = { title: 'Reportar un problema · REYMEN SmartCard' }

const ERROR_MESSAGES: Record<string, string> = {
  missing_message: 'Escribe qué encontraste antes de enviar.',
  save_failed: 'No se pudo enviar el reporte. Intenta de nuevo.',
}

/**
 * Canal de feedback del lado público (Fase 17) -- pensado para que un
 * cliente real, viendo su propia tarjeta, pueda avisar de algo que no se ve
 * o no funciona bien, sin tener que buscar un correo de soporte. Página
 * standalone (no un modal/sección dentro de ProfileView.tsx) a propósito:
 * mantiene esa pantalla enfocada en un solo propósito (mostrar el perfil) y
 * evita el riesgo de romper su estructura ya afinada con datos reales (ver
 * los comentarios de esa pantalla sobre ajustes ya probados).
 *
 * `?slug=` es opcional -- llega precargado cuando el link viene del footer
 * de un perfil (ProfileView.tsx), pero esta pantalla funciona igual sin él
 * (alguien puede llegar aquí directo). Estilos en línea, mismo criterio que
 * not-found.tsx/error.tsx: no depende del tema de ningún cliente en
 * particular.
 */
export default async function PublicFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string; sent?: string; error?: string }>
}) {
  const { slug, sent, error } = await searchParams
  const message = error ? (ERROR_MESSAGES[error] ?? 'Ocurrió un error. Intenta de nuevo.') : null

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '48px 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
        background: '#FBF6EF',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#242821', margin: '0 0 8px' }}>
          Reportar un problema
        </h1>
        <p style={{ fontSize: 14, color: '#52594B', margin: '0 0 24px', lineHeight: 1.5 }}>
          {slug
            ? 'Cuéntanos qué viste mal en esta tarjeta -- lo revisamos lo antes posible.'
            : 'Cuéntanos qué encontraste -- lo revisamos lo antes posible.'}
        </p>

        {sent === '1' ? (
          <p
            role="status"
            style={{
              margin: 0,
              padding: '14px 16px',
              borderRadius: 14,
              background: '#E7F3EA',
              color: '#1B4332',
              fontSize: 14,
            }}
          >
            Gracias -- recibimos tu reporte.
          </p>
        ) : (
          <form action={submitPublicFeedbackAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {slug && <input type="hidden" name="profile_slug" value={slug} />}
            <input type="hidden" name="page_url" value={slug ? `/${slug}` : ''} />

            {message && (
              <p role="alert" style={{ margin: 0, padding: '10px 14px', borderRadius: 12, background: '#FBEAEA', color: '#8A2E2E', fontSize: 13 }}>
                {message}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="message" style={{ fontSize: 13, fontWeight: 600, color: '#242821' }}>
                ¿Qué encontraste? *
              </label>
              <textarea
                id="message"
                name="message"
                required
                rows={5}
                maxLength={2000}
                placeholder="Ej. el logo no carga, un link va al lugar equivocado, el botón de WhatsApp no abre..."
                style={{
                  borderRadius: 14,
                  border: '1px solid #ECE1D2',
                  padding: '12px 14px',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  resize: 'vertical',
                  background: '#FFFFFF',
                  color: '#242821',
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label htmlFor="contact_email" style={{ fontSize: 13, fontWeight: 600, color: '#242821' }}>
                Tu correo (opcional, por si hay que darte seguimiento)
              </label>
              <input
                id="contact_email"
                name="contact_email"
                type="email"
                placeholder="tu@correo.com"
                style={{
                  borderRadius: 14,
                  border: '1px solid #ECE1D2',
                  padding: '12px 14px',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  background: '#FFFFFF',
                  color: '#242821',
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                marginTop: 4,
                height: 48,
                borderRadius: 9999,
                border: 'none',
                background: '#242821',
                color: '#FBF6EF',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Enviar reporte
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
