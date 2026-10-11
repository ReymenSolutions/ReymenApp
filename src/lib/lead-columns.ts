/** Columnas de la tabla de leads que cada persona puede mostrar u ocultar. El nombre siempre se ve. */
export const BASE_COLUMNS = ["contact", "source", "status", "score", "date"] as const;
export type BaseColumn = (typeof BASE_COLUMNS)[number];

export interface LeadColumnPrefs {
  /** Columnas base ocultas. */
  hidden: BaseColumn[];
  /** Claves de campos personalizados que se muestran, en el orden elegido. */
  custom: string[];
}

export const DEFAULT_LEAD_COLUMNS: LeadColumnPrefs = { hidden: [], custom: [] };

/**
 * Limpia una preferencia guardada o recibida: descarta lo desconocido y los duplicados,
 * y quita los campos personalizados que ya no existen o están archivados.
 */
export function sanitizeLeadColumns(raw: unknown, activeKeys: string[]): LeadColumnPrefs {
  if (!raw || typeof raw !== "object") return { hidden: [], custom: [] };
  const { hidden, custom } = raw as { hidden?: unknown; custom?: unknown };
  const baseSet = new Set<string>(BASE_COLUMNS);
  const active = new Set(activeKeys);
  const uniq = <T,>(list: unknown, ok: (v: unknown) => v is T): T[] => [...new Set(Array.isArray(list) ? list.filter(ok) : [])];
  return {
    hidden: uniq(hidden, (v): v is BaseColumn => typeof v === "string" && baseSet.has(v)),
    custom: uniq(custom, (v): v is string => typeof v === "string" && active.has(v)),
  };
}
