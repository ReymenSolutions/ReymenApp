import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'REYMEN Ops',
  description: 'Panel de autoservicio para empresas cliente de REYMEN Ops.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  )
}
