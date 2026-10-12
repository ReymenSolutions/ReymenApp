import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto de la tabla de leads: buscador, filtros y filas con las mismas columnas. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Skeleton className="h-9 w-full max-w-sm" />
        <div className="flex gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-6 w-16 rounded-full" />
          ))}
        </div>
      </div>
      <div className="overflow-hidden rounded-card border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
          <Skeleton className="h-3 w-1/3" />
        </div>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="hidden h-4 w-32 sm:block" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
