'use client'

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Error boundary de toda ruta del panel (Fase 17) -- antes de esto, un error
 * de React sin capturar dejaba una pantalla en blanco sin ningún rastro
 * (FASE17.md sección 0/2). Next.js App Router usa este archivo solo si
 * existe -- no hace falta importarlo en ningún lado.
 *
 * `retry` (no `reset`): esta versión de Next.js renombró la prop del boundary
 * -- ver node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md.
 *
 * Debe ser Client Component (boundaries de React solo funcionan del lado del
 * cliente) y, por eso mismo, NO puede usar el mismo `console.error('[tag] ...')`
 * de servidor que sí llega a `docker logs` (login/actions.ts, Fase 16) --
 * este log queda en la consola del navegador de quien lo vivió, útil para
 * que esa persona reporte lo que vio, pero no aparece en los logs del VPS.
 */
export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[error-boundary] error sin capturar en el panel:', error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">Algo salió mal</h1>
      <p className="text-sm text-neutral-500">
        Ocurrió un error inesperado en el panel. Intenta de nuevo -- si sigue pasando, repórtalo
        desde <Link href="/feedback" className="underline">Feedback</Link> describiendo qué estabas
        haciendo.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Intentar de nuevo
        </button>
        <Link href="/" className="text-sm text-neutral-500 underline">
          Ir al inicio
        </Link>
      </div>
    </main>
  )
}
