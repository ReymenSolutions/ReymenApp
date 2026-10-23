import Link from 'next/link'
import { getCurrentAdmin } from '../lib/current-admin'

/**
 * Encabezado compartido de toda pantalla ya autenticada (Server Component --
 * lee la sesión igual que cualquier otra página, no recibe props). Si no hay
 * sesión no debería ni renderizarse -- el proxy ya redirige antes de llegar
 * aquí -- pero devuelve null en vez de asumir un admin no-null, por si algún
 * día una ruta pública lo importa por error.
 */
export async function AdminHeader() {
  const admin = await getCurrentAdmin()
  if (!admin) return null

  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4">
      <nav className="flex items-center gap-4 text-sm font-medium">
        <Link href="/" className="text-neutral-900 hover:underline">
          REYMEN Admin
        </Link>
        <Link href="/clients" className="text-neutral-600 hover:text-neutral-900 hover:underline">
          Clientes
        </Link>
        <Link href="/companies" className="text-neutral-600 hover:text-neutral-900 hover:underline">
          Empresas (Ops)
        </Link>
        <Link href="/profiles" className="text-neutral-600 hover:text-neutral-900 hover:underline">
          Perfiles
        </Link>
        <Link href="/cards" className="text-neutral-600 hover:text-neutral-900 hover:underline">
          Tarjetas
        </Link>
        <Link href="/analytics" className="text-neutral-600 hover:text-neutral-900 hover:underline">
          Analítica
        </Link>
        <Link href="/feedback" className="text-neutral-600 hover:text-neutral-900 hover:underline">
          Feedback
        </Link>
        {admin.role === 'SUPERADMIN' && (
          <Link href="/users" className="text-neutral-600 hover:text-neutral-900 hover:underline">
            Usuarios
          </Link>
        )}
        <Link href="/settings" className="text-neutral-600 hover:text-neutral-900 hover:underline">
          Ajustes
        </Link>
      </nav>
      <div className="flex items-center gap-3 text-sm text-neutral-500">
        <span>
          {admin.full_name} · {admin.role}
        </span>
        <form action="/auth/logout" method="post">
          <button type="submit" className="text-red-600 underline">
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  )
}
