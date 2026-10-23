'use client'

import { useEffect } from 'react'

/**
 * Boundary de último recurso (Fase 17): solo se activa si el error ocurre en
 * el propio root layout, donde error.tsx (que vive DENTRO del layout) no
 * puede atraparlo -- reemplaza <html>/<body> enteros mientras está activo,
 * así que debe traer los suyos propios (ver la guía de Next.js citada en
 * error.tsx). No importa `globals.css` porque en este punto ni siquiera el
 * layout raíz se montó -- estilos mínimos en línea, igual que
 * apps/public/app/not-found.tsx.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[global-error] error sin capturar en el layout raíz del panel:', error)
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
          gap: 16,
          padding: 32,
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Algo salió mal</h1>
        <p style={{ fontSize: 14, color: '#6b7280', margin: 0, maxWidth: 320 }}>
          El panel no pudo cargar. Intenta de nuevo -- si sigue pasando, avísale al equipo.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          style={{
            borderRadius: 6,
            background: '#171717',
            color: '#fff',
            padding: '8px 14px',
            fontSize: 14,
            fontWeight: 500,
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
