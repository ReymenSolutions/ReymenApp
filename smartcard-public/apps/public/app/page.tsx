// Nadie llega aquí en el flujo real del producto -- un scan NFC/QR entra por
// /n/{code} o /q/{code}, y un link compartido entra por /{slug}. Esta raíz
// solo existe para que el dominio no muestre un 404 si alguien lo visita a
// secas.
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold">REYMEN SmartCard</h1>
      <p className="text-neutral-600">
        Identidad digital y redirección inteligente para tarjetas NFC y QR.
      </p>
    </main>
  )
}
