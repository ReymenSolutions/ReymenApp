// Formato de cifras compartido por el servidor y el cliente (moneda, porcentaje, decimales).

export type NumberFormat = {
  style?: "decimal" | "currency" | "percent";
  currency?: string;
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
  /** Texto que va pegado al final (p. ej. " días"). */
  suffix?: string;
};

export function formatNumber(value: number, f: NumberFormat = {}): string {
  const style = f.style ?? "decimal";
  const out = new Intl.NumberFormat("es-MX", {
    style,
    currency: style === "currency" ? (f.currency ?? "MXN") : undefined,
    maximumFractionDigits: f.maximumFractionDigits ?? (style === "percent" ? 0 : style === "currency" ? 0 : 0),
    minimumFractionDigits: f.minimumFractionDigits,
  }).format(value);
  return f.suffix ? `${out}${f.suffix}` : out;
}
