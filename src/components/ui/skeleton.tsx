import { cn } from "@/lib/utils";

/** Bloque de carga: se parece a lo que va a aparecer, para que la pantalla no salte al llegar los datos. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-skeleton rounded-md bg-slate-200/80", className)} {...props} />;
}
