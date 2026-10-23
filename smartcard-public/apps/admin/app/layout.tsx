import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'REYMEN SmartCard Admin',
  description: 'Panel administrativo interno de REYMEN.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  )
}
