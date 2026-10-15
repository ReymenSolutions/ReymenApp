import { MetricGrid } from "@/components/shared/MetricGrid";

export default function SmartcardLoading() {
  return <section className="mx-auto w-full max-w-6xl space-y-4" role="status" aria-busy="true" aria-label="Cargando SmartCard / Loading SmartCard">
    <div className="h-8 w-40 rounded bg-slate-200 animate-skeleton motion-reduce:animate-none" />
    <div className="h-20 rounded-xl border border-slate-200 bg-white" />
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <MetricGrid>{[0, 1, 2].map(i => <div key={i} className="h-20 rounded-lg bg-slate-100 animate-skeleton motion-reduce:animate-none" />)}</MetricGrid>
      <div className="h-36 rounded-lg bg-slate-100 animate-skeleton motion-reduce:animate-none" />
      <MetricGrid columns={2} density="comfortable">{[0, 1].map(i => <div key={i} className="h-44 rounded-lg bg-slate-100 animate-skeleton motion-reduce:animate-none" />)}</MetricGrid>
    </div>
  </section>;
}
