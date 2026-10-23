import Link from 'next/link'
import type { Entitlements } from '@reymen/entitlements'
import { hasModule } from '@reymen/entitlements'
import type { CurrentCompanyUser } from '../lib/current-company-user'

// REYMEN_OPS_PLAN.md sección 9: la navegación se arma según los módulos
// contratados, no al revés. Fase 1 solo tiene Dashboard/Configuración
// (SmartCard llega en Fase 2, Realty en Fase 3, Food en Fase 4) -- pero ya
// queda la estructura condicionada por módulo desde ahora, para no tener
// que reescribir esto cuando lleguen las verticales.
export function OpsNav({
  user,
  entitlements,
}: {
  user: CurrentCompanyUser
  entitlements: Entitlements
}) {
  return (
    <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4">
      <nav className="flex items-center gap-4 text-sm font-medium">
        <Link href="/dashboard" className="text-neutral-900 hover:underline">
          {user.companyName}
        </Link>
        {hasModule(entitlements, 'smartcard') && (
          <Link href="/smartcard" className="text-neutral-600 hover:text-neutral-900 hover:underline">
            SmartCard
          </Link>
        )}
        {hasModule(entitlements, 'realty') && (
          <Link href="/realty" className="text-neutral-600 hover:text-neutral-900 hover:underline">
            Realty
          </Link>
        )}
        {hasModule(entitlements, 'food') && (
          <Link href="/food" className="text-neutral-600 hover:text-neutral-900 hover:underline">
            Food
          </Link>
        )}
        <Link href="/settings" className="text-neutral-600 hover:text-neutral-900 hover:underline">
          Configuración
        </Link>
      </nav>
      <span className="text-sm text-neutral-500">{user.email}</span>
    </header>
  )
}
