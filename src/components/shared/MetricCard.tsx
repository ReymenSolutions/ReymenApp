import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import type { NumberFormat } from "@/lib/format-number";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  /** Un número se anima (sube desde 0 al cargar y se interpola al cambiar); un texto ya formateado se muestra tal cual. */
  value: string | number;
  /** Formato de la cifra cuando `value` es un número: moneda, porcentaje, decimales. */
  format?: NumberFormat;
  description?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  className?: string;
  iconClassName?: string;
  /** "hero" = la métrica principal: fondo degradado del color de Reymen. */
  variant?: "default" | "hero";
  /** Posición para la entrada escalonada (50 ms por tarjeta). */
  index?: number;
  /** Datos secundarios debajo de la cifra (barras, desglose…). */
  children?: ReactNode;
}

// Ojo: en modo oscuro `white` se remapea a una superficie oscura (globals.css), así que lo que debe verse blanco
// sobre el degradado se escribe con valores rgb() y no con bg-white.
export function MetricCard({ title, value, format, description, icon: Icon, trend, className, iconClassName, variant = "default", index = 0, children }: MetricCardProps) {
  const hero = variant === "hero";
  return (
    <Card
      className={cn("reveal relative overflow-hidden", hero && "border-transparent bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 text-white shadow-pop", className)}
      style={{ "--i": index } as React.CSSProperties}
    >
      {hero && <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[rgb(255_255_255/0.1)] blur-2xl" />}
      <CardContent className={cn("relative", hero ? "p-5 sm:p-6" : "p-4 sm:p-5")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn("text-xs font-medium", hero ? "text-brand-100" : "text-slate-500")}>{title}</p>
            <p className={cn("mt-1.5 font-semibold tabular-nums tracking-tight", hero ? "text-3xl sm:text-4xl text-white" : "text-2xl text-slate-900")}>
              {typeof value === "number" ? <AnimatedNumber value={value} format={format} /> : value}
            </p>
            {trend && (
              <p
                className={cn(
                  "mt-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium",
                  hero ? "bg-[rgb(255_255_255/0.15)] text-white" : trend.value >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
                )}
              >
                {trend.value >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {trend.value >= 0 ? "+" : ""}
                {trend.value}% <span className={cn("ml-1 font-normal", hero ? "text-brand-100" : "text-slate-500")}>{trend.label}</span>
              </p>
            )}
            {description && <p className={cn("mt-1.5 text-xs", hero ? "text-brand-100" : "text-slate-500")}>{description}</p>}
          </div>
          <div className={cn("rounded-chip p-2", hero ? "bg-[rgb(255_255_255/0.15)]" : "bg-brand-50", iconClassName)}>
            <Icon className={cn("h-4 w-4", hero ? "text-white" : "text-brand-600")} />
          </div>
        </div>
        {children && <div className="mt-4">{children}</div>}
      </CardContent>
    </Card>
  );
}
