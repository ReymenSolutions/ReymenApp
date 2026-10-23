'use client'

import { useEffect } from 'react'

/**
 * Error boundary de este sitio (Fase 17) -- antes un error de React sin
 * capturar (ej. un tema con datos corruptos, un dato inesperado del perfil)
 * dejaba una pantalla en blanco sin ningún rastro. Mismo mecanismo que
 * not-found.tsx (Next.js App Router lo usa solo porque existe), pero este SÍ
 * necesita ser Client Component -- boundaries de error solo funcionan del
 * lado del cliente (ver la guía citada en apps/admin/app/error.tsx).
 *
 * `retry`, no `reset` -- esta versión de Next.js renombró la prop (ver
 * node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md).
 *
 * Estilos en línea, mismo criterio de not-found.tsx: esta pantalla la ve
 * quien escaneó una tarjeta NFC/QR, con cualquier tema de cualquier cliente
 * de fondo -- no tiene sentido depender de `tokens` de un perfil que
 * probablemente sea justo el que falló al renderizar.
 */
export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[error-boundary] error sin capturar en el perfil público:', error)

    // Este console.error solo llega a la consola del navegador de quien lo
    // vivió -- se reenvía a /api/client-error para que quede también en
    // docker logs y contabilizado en `events` (ver ese route handler).
    // Nunca debe tumbar nada si falla: solo un log adicional perdido.
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        digest: error.digest ?? null,
        path: typeof window !== 'undefined' ? window.location.pathname : null,
      }),
    }).catch(() => {})
  }, [error])

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 32,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#242821', margin: 0 }}>
        Algo salió mal
      </h1>
      <p style={{ fontSize: 14, color: '#7B8578', margin: 0, maxWidth: 320 }}>
        No pudimos mostrar esta tarjeta. Intenta de nuevo -- puede ser algo pasajero.
      </p>
      <button
        type="button"
        onClick={() => retry()}
        style={{
          marginTop: 4,
          borderRadius: 9999,
          background: '#242821',
          color: '#FBF6EF',
          padding: '10px 20px',
          fontSize: 14,
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
        }}
      >
        Intentar de nuevo
      </button>
    </main>
  )
}
