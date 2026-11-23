import Link from "next/link";

// Marco de la web pública de Retail: banner Reymen (logo RM real del repo, azul marino y azul rey), navegación y pie.
export function RetailShell({ orgName, slug, children }: { orgName: string; slug: string; children: React.ReactNode }) {
  return (
    <div className="rt flex min-h-dvh flex-col">
      <header className="bg-[linear-gradient(120deg,var(--rt-navy)_0%,var(--rt-navy-2)_55%,var(--rt-royal)_140%)] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href={`/tienda/${slug}`} className="flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo del repo (src/app/icon.png) */}
            <img src="/icon.png" alt="Reymen" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl ring-1 ring-white/25" />
            <span className="min-w-0">
              <span className="block truncate text-lg font-bold leading-tight">{orgName}</span>
              <span className="block text-xs font-medium uppercase tracking-[0.18em] text-white/70">Tienda en línea</span>
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1 text-sm font-semibold">
            <Link href={`/tienda/${slug}`} className="rounded-full px-3 py-2 hover:bg-white/10">Inicio</Link>
            <Link href={`/tienda/${slug}/catalogo`} className="rounded-full bg-white px-4 py-2 text-[var(--rt-navy)] hover:bg-white/90">Catálogo</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">{children}</main>
      <footer className="border-t border-[var(--rt-line)] bg-[var(--rt-surface)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm text-[var(--rt-muted)]">
          <span>© {new Date().getFullYear()} {orgName}</span>
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- logo fijo del repo */}
            <img src="/icon.png" alt="" width={20} height={20} className="h-5 w-5 rounded" />
            Con la plataforma Reymen
          </span>
        </div>
      </footer>
    </div>
  );
}
