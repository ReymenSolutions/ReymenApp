/** Texto sin acentos ni mayúsculas, para buscar "recuperacion" y encontrar "Recuperación". */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** ¿Coinciden todas las palabras de la búsqueda con alguno de los textos? (sin acentos ni mayúsculas) */
export function matchesSearch(query: string, ...texts: (string | null | undefined)[]): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(texts.filter(Boolean).join(" "));
  return words.every((w) => haystack.includes(w));
}
