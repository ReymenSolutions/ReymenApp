/** Esqueleto que se ve al instante mientras llega la pantalla nueva. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl " aria-busy="true" aria-live="polite">
      <div className="mb-6 h-8 w-64 rounded-lg bg-slate-200 animate-skeleton" />
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl border border-slate-200 bg-white animate-skeleton" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-32 rounded-2xl border border-slate-200 bg-white animate-skeleton" />
        ))}
      </div>
    </div>
  );
}
