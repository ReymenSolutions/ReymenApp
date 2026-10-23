// Se usa automáticamente cuando cualquier página de este app llama a
// notFound() (perfil inexistente/dado de baja, tarjeta inexistente, slug
// que no corresponde a nada) -- Next.js App Router la resuelve sola, no
// hace falta importarla en ningún lado.
export default function NotFound() {
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
        No encontramos esta página
      </h1>
      <p style={{ fontSize: 14, color: '#7B8578', margin: 0, maxWidth: 320 }}>
        Revisa el enlace o código -- puede que ya no exista o esté escrito distinto.
      </p>
    </main>
  )
}
