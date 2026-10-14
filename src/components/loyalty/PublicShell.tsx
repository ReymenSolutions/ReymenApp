import { UtensilsCrossed } from "lucide-react";

/** Marco mobile-first de las páginas públicas de Lealtad (inscripción y tarjeta). */
export function PublicShell({ businessName, logoUrl, children }: { businessName: string; logoUrl: string | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-950 via-brand-900 to-slate-100 px-4 py-6 sm:py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-4 flex items-center justify-center gap-2 text-white">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-9 w-9 rounded-lg bg-white object-cover" />
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10">
              <UtensilsCrossed className="h-5 w-5 text-orange-300" aria-hidden="true" />
            </span>
          )}
          <span className="text-lg font-bold tracking-tight">{businessName}</span>
        </div>
        <main className="overflow-hidden rounded-3xl bg-white shadow-xl">{children}</main>
      </div>
    </div>
  );
}

export function PublicMessage({ text }: { text: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <p className="max-w-sm rounded-2xl bg-white p-6 text-center text-slate-600 shadow">{text}</p>
    </div>
  );
}
