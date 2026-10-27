import type { LucideIcon } from "lucide-react";

/** Bloque de la ficha del contacto: título, una línea que explica para qué sirve y su contenido. */
export function LeadSection({ icon: Icon, title, hint, action, children }: { icon: LucideIcon; title: string; hint: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-card border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{hint}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LeadStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-slate-200 bg-white px-4 py-3 shadow-card">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export function LeadRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="flex-shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}
