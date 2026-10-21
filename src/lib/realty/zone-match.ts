// Pure module. Qué zona corresponde a una dirección (ver PropertyForm).

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Zona que corresponde a la dirección: mismo nombre que la colonia, mismo CP, o un nombre que empieza con la colonia. */
export function matchZone<Z extends { id: string; name: string; postalCode?: string | null }>(zones: Z[], colonia: string, cp: string): Z | null {
  const col = norm(colonia);
  if (col) {
    const exact = zones.find((z) => norm(z.name) === col);
    if (exact) return exact;
  }
  if (/^\d{5}$/.test(cp)) {
    const byCp = zones.find((z) => z.postalCode === cp);
    if (byCp) return byCp;
  }
  if (col.length >= 4) return zones.find((z) => norm(z.name).startsWith(col)) ?? null;
  return null;
}
