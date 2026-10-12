import { Skeleton } from "@/components/ui/skeleton";

/** Reproduce la estructura del pipeline (encabezado + columnas con tarjetas) para que no haya saltos al cargar. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mb-6 flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <div className="-mx-4 flex gap-3 overflow-hidden px-4 sm:mx-0 sm:px-0">
        {[3, 2, 2, 1].map((cards, col) => (
          <div key={col} className="w-[17.5rem] flex-shrink-0 sm:w-72">
            <div className="mb-2 space-y-1.5 px-1">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-6 rounded-full" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="min-h-[7.5rem] space-y-2 rounded-card bg-slate-50 p-2">
              {Array.from({ length: cards }).map((_, i) => (
                <div key={i} className="space-y-2 rounded-card border border-slate-200 bg-white p-3 shadow-card">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex items-center justify-between pt-1">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-5 w-5 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
