import { cn } from "@/lib/utils";

/** Progreso hacia la recompensa como puntos (≤ 12 visitas) o barra. */
export function ProgressDots({ current, goal, size = "sm", bar = false }: { current: number; goal: number; size?: "sm" | "lg"; /** Barra delgada (tablas). */ bar?: boolean }) {
  if (bar || goal > 12) {
    return (
      <div className="h-2 w-full rounded-full bg-slate-100" role="img" aria-label={`${current} / ${goal}`}>
        <div className="h-2 rounded-full bg-orange-500" style={{ width: `${Math.round((current / goal) * 100)}%` }} />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1" role="img" aria-label={`${current} / ${goal}`}>
      {Array.from({ length: goal }, (_, i) => (
        <span
          key={i}
          className={cn(
            "rounded-full",
            size === "lg" ? "h-5 w-5" : "h-2.5 w-2.5",
            i < current ? "bg-orange-500" : "bg-slate-200",
            i === goal - 1 && i >= current && "ring-1 ring-orange-300"
          )}
        />
      ))}
    </div>
  );
}
