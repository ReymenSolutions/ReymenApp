import type { CSSProperties, ElementType, HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Entrada de un elemento: aparece con opacidad y 8 px de desplazamiento vertical; `index` escalona la
 * entrada 50 ms por elemento. Es CSS puro (sirve en componentes de servidor y no se repite en cada render).
 */
export function Reveal({ index = 0, as, className, style, ...rest }: { index?: number; as?: ElementType } & HTMLAttributes<HTMLElement>) {
  const Tag = as ?? "div";
  return <Tag className={cn("reveal", className)} style={{ "--i": index, ...style } as CSSProperties} {...rest} />;
}
