import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'REYMEN SmartCard',
  description: 'Identidad digital y redirección inteligente para tarjetas NFC y QR.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  )
}
