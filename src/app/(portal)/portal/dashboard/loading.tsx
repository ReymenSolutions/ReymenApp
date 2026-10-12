import { Skeleton } from "@/components/ui/skeleton";

/** Esqueleto del dashboard: título, tarjeta principal, fila de métricas y las dos listas. */
export default function Loading() {
  const metric = (
    <div className="space-y-3 rounded-card border border-slate-200 bg-white p-5 shadow-card">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-16" />
    </div>
  );
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 rounded-card border border-slate-200 bg-white p-6 shadow-card lg:col-span-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-44" />
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
        {metric}
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i}>{metric}</div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="space-y-4 rounded-card border border-slate-200 bg-white p-6 shadow-card">
            <Skeleton className="h-5 w-36" />
            {[0, 1, 2].map((r) => (
              <div key={r} className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
