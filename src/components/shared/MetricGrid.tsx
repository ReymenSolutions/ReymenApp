import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Container-responsive grid: a solitary final item always fills its row. */
export function MetricGrid({ children, columns = 3, density = "compact", as: Tag = "div", className }: {
  children: ReactNode;
  density?: "compact" | "comfortable";
  as?: "div" | "ul";
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  return <div className={cn("metric-grid-container min-w-0", className)}>
    <Tag className="metric-grid" data-columns={columns} data-density={density}>{children}</Tag>
  </div>;
}
