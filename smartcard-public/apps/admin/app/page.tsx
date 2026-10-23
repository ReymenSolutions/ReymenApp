import Link from 'next/link'
import { AdminHeader } from '../components/AdminHeader'

export default async function AdminHomePage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <AdminHeader />
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">REYMEN SmartCard — Admin</h1>
        <p className="text-neutral-600">
          Sesión real con Supabase Auth, rutas protegidas por middleware, alta de administradores
          por invitación (Fase 4) y gestión de clientes (Fase 5).
        </p>
        <Link
          href="/clients"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          Ir a Clientes
        </Link>
        <p className="text-sm text-neutral-400">
          Los módulos de perfiles, tarjetas y analítica llegan en fases siguientes.
        </p>
      </div>
    </main>
  )
}
