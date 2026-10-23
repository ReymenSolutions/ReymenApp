// Mensaje para una tarjeta que existe pero está desactivada (`cards.status
// = 'INACTIVE'`, dada de baja desde el panel admin) -- deliberadamente no es
// un 404: el código es real, solo no está sirviendo destino por ahora. Un
// 404 genérico ahí confundiría más de lo que ayuda.
export function CardInactive() {
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
        Esta tarjeta no está activa
      </h1>
      <p style={{ fontSize: 14, color: '#7B8578', margin: 0, maxWidth: 320 }}>
        Si crees que esto es un error, contacta a quien te la entregó.
      </p>
    </main>
  )
}
