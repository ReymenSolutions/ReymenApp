// Pure module — importable from client and server contexts.
//
// Paginación de listas: página y tamaño de página vienen de la URL (`page` y `ps`). El tamaño solo puede ser uno de los
// permitidos; cualquier otro valor cae al predeterminado de esa lista.

export const PAGE_SIZES = [10, 25, 50, 100] as const;

export function parsePaging(sp: { page?: string; ps?: string }, defaultSize = 25): { page: number; pageSize: number } {
  const ps = Number(sp.ps);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(ps) ? ps : defaultSize;
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  return { page, pageSize };
}

export function totalPagesOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** «Mostrando 51–100 de 230»: primer y último número de la página (0–0 si no hay resultados). */
export function rangeOf(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total === 0) return { from: 0, to: 0 };
  const from = (page - 1) * pageSize + 1;
  return { from: Math.min(from, total), to: Math.min(page * pageSize, total) };
}

/** Números de página a mostrar: siempre la primera y la última y las vecinas de la actual; los huecos son "gap". */
export function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  const keep = new Set([1, totalPages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= totalPages));
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev === 2) out.push(prev + 1);
    else if (n - prev > 2) out.push("gap");
    out.push(n);
    prev = n;
  }
  return out;
}
