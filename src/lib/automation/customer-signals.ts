// ── Señales de clientes (puras) ──────────────────────────────────────────────
// Reglas deterministas y explicables para "quién vino una sola vez" y "quién se está alejando".

const DAY = 86_400_000;

/** Fechas (día UTC) distintas, ordenadas: varias compras el mismo día cuentan como una visita. */
function distinctDays(dates: Date[]): number[] {
  return [...new Set(dates.map((d) => Math.floor(d.getTime() / DAY)))].sort((a, b) => a - b);
}

/** Mediana de los días entre visitas consecutivas (robusta a visitas sueltas). Null con menos de dos visitas. */
export function medianIntervalDays(visits: Date[]): number | null {
  const days = distinctDays(visits);
  if (days.length < 2) return null;
  const gaps = days.slice(1).map((d, i) => d - days[i]).sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
}

export type AtRiskInput = { visitCount: number; lastVisitAt: Date | null; visits: Date[]; now: Date; minVisits: number; minDays: number; factor: number; maxDays: number };

/**
 * En riesgo = habitual (≥ minVisits) cuya ausencia pasa de max(minDays, factor × su intervalo mediano) sin llegar a maxDays.
 * Ejemplo: suele venir cada 12 días y lleva 31 → 31 > max(21, 2.5 × 12 = 30). Devuelve los días sin venir, o null.
 */
export function atRiskDays(input: AtRiskInput): number | null {
  const { visitCount, lastVisitAt, visits, now, minVisits, minDays, factor, maxDays } = input;
  if (!lastVisitAt || visitCount < minVisits) return null;
  const median = medianIntervalDays(visits);
  if (median === null) return null;
  const daysSince = Math.floor((now.getTime() - lastVisitAt.getTime()) / DAY);
  const threshold = Math.max(minDays, factor * median);
  return daysSince > threshold && daysSince <= maxDays ? daysSince : null;
}
