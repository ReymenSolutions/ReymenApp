// Pure module — importable from client and server contexts.
//
// Periodos del dashboard de Lealtad (Hoy, 7 días, 30 días, Mes, Rango) en la
// zona horaria de la organización (Organization.timezone), para que "hoy" y
// los días de las gráficas sean los del negocio y no los del servidor.

export type PeriodKey = "today" | "7d" | "30d" | "month" | "custom";
export const PERIOD_KEYS: PeriodKey[] = ["today", "7d", "30d", "month", "custom"];

export interface Period {
  key: PeriodKey;
  /** Inicio inclusivo (instante UTC de la medianoche local). */
  from: Date;
  /** Fin exclusivo. */
  to: Date;
  /** Periodo anterior de la misma duración (para tendencias). */
  prevFrom: Date;
  prevTo: Date;
  /** Días locales del periodo, "YYYY-MM-DD", en orden. */
  days: string[];
  /** Valores de los campos del rango (YYYY-MM-DD) para re-dibujar el formulario. */
  fromDay: string;
  toDay: string;
}

const DAY_MS = 86_400_000;
const MAX_CUSTOM_DAYS = 366;

/** Partes de fecha locales de `date` en `tz`. */
function localParts(date: Date, tz: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Diferencia (ms) entre la hora local de `tz` y UTC en ese instante. */
function tzOffsetMs(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Instante UTC de la medianoche local del día y/m/d en `tz`. */
export function zonedMidnight(y: number, m: number, d: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - tzOffsetMs(new Date(guess), tz);
  // Segunda pasada por si el cambio de horario cae entre guess y first.
  return new Date(guess - tzOffsetMs(new Date(first), tz));
}

/** Día local "YYYY-MM-DD" de un instante. */
export function dayKey(date: Date, tz: string): string {
  const { y, m, d } = localParts(date, tz);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDay(s: string | undefined): { y: number; m: number; d: number } | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

function addDays(p: { y: number; m: number; d: number }, n: number) {
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d) + n * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function fmt(p: { y: number; m: number; d: number }) {
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

function daysBetween(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / DAY_MS);
}

/**
 * Lee ?p=…&from=…&to=… . Desconocido → 30 días. Un rango inválido o invertido
 * cae a 30 días; un rango personalizado se limita a un año.
 */
export function resolvePeriod(params: { p?: string; from?: string; to?: string }, tz: string, now: Date = new Date()): Period {
  const today = localParts(now, tz);
  let key: PeriodKey = PERIOD_KEYS.includes(params.p as PeriodKey) ? (params.p as PeriodKey) : "30d";
  let start = today;
  let endInclusive = today;

  if (key === "today") {
    start = today;
  } else if (key === "7d") {
    start = addDays(today, -6);
  } else if (key === "month") {
    start = { y: today.y, m: today.m, d: 1 };
  } else if (key === "custom") {
    const a = parseDay(params.from);
    const b = parseDay(params.to);
    if (a && b && daysBetween(a, b) >= 0) {
      start = a;
      endInclusive = daysBetween(a, b) > MAX_CUSTOM_DAYS ? addDays(a, MAX_CUSTOM_DAYS) : b;
    } else {
      key = "30d";
    }
  }
  if (key === "30d") start = addDays(today, -29);

  const length = daysBetween(start, endInclusive) + 1;
  const from = zonedMidnight(start.y, start.m, start.d, tz);
  const endNext = addDays(endInclusive, 1);
  const to = zonedMidnight(endNext.y, endNext.m, endNext.d, tz);
  const prevStart = addDays(start, -length);
  const prevFrom = zonedMidnight(prevStart.y, prevStart.m, prevStart.d, tz);
  const days = Array.from({ length }, (_, i) => fmt(addDays(start, i)));
  return { key, from, to, prevFrom, prevTo: from, days, fromDay: fmt(start), toDay: fmt(endInclusive) };
}

/** Cambio porcentual entero vs. el periodo anterior; null si no hay base. */
export function trendPct(current: number, previous: number): number | null {
  if (!previous || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
