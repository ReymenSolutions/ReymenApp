'use client'

import { useEffect } from 'react'

/**
 * Último recurso (Fase 17): solo se activa si el error ocurre en el propio
 * root layout, donde error.tsx (dentro del layout) no llega -- reemplaza
 * <html>/<body> enteros mientras está activo, así que trae los suyos, igual
 * que apps/admin/app/global-error.tsx (mismo razonamiento ahí).
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[global-error] error sin capturar en el layout raíz público:', error)
  }, [error])

  return (
    <html lang="es">
      <body
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 32,
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#FBF6EF',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#242821', margin: 0 }}>
          Algo salió mal
        </h1>
        <p style={{ fontSize: 14, color: '#7B8578', margin: 0, maxWidth: 320 }}>
          Esta página no pudo cargar. Intenta de nuevo en un momento.
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
      </body>
    </html>
  )
}
