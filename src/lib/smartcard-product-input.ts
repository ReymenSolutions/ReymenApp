// Producto manual de una SmartCard (e-commerce: serums, ropa, etc.). Puro y sin
// servidor para que lo usen la acción y el formulario.
//
// La tarjeta pública solo muestra título, subtítulo, precio, foto y botón (las
// columnas de profile_links), así que las características (ej. "30 ml",
// "Vitamina C") se guardan unidas por « · » en el subtítulo, que ya se pinta
// bajo el título — mismo formato que usa Real Estate ("Casa · 3 rec · Cumbres").

export const MAX_PRODUCT_CHARACTERISTICS = 6;
export const MAX_CHARACTERISTIC_LENGTH = 40;
export const PRODUCT_SUBTITLE_MAX = 140;

export function cleanCharacteristics(list: readonly string[]): string[] {
  return list
    .map((c) => c.replace(/\s+/g, " ").trim().slice(0, MAX_CHARACTERISTIC_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_PRODUCT_CHARACTERISTICS);
}

/** Une las características para el subtítulo, sin pasar del límite de la columna. */
export function characteristicsToSubtitle(list: readonly string[]): string | null {
  let out = "";
  for (const c of cleanCharacteristics(list)) {
    const next = out ? `${out} · ${c}` : c;
    if (next.length > PRODUCT_SUBTITLE_MAX) break;
    out = next;
  }
  return out || null;
}

/** Lo contrario, para mostrarlas como etiquetas en la vista previa. */
export function subtitleToCharacteristics(subtitle: string | null | undefined): string[] {
  return (subtitle ?? "").split("·").map((s) => s.trim()).filter(Boolean);
}
