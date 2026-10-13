import { prisma } from "@/lib/prisma";

// ─── Día de negocio en la zona horaria de CADA organización ──────────────────────────────────────────────────────
// Antes el "día" de Food era el del proceso del servidor (UTC en un contenedor): una venta a las 8 pm en México se
// contaba como del día siguiente. Ahora todo usa `Organization.timezone`. Hay dos representaciones, a propósito:
//  - INSTANTE: el momento real (ventas, consumos). Los límites de "hoy" son la medianoche local → `startOfLocalDay`.
//  - CLAVE DE DÍA: los conteos diarios (FoodDishSale / FoodModifierOptionSale) se guardan con `occurredAt` = la fecha
//    local a las 00:00 UTC (`dayKey`). Es la misma forma que ya tenían con el servidor en UTC, así que los datos
//    existentes siguen siendo válidos sin migrarlos.

export const DEFAULT_TIMEZONE = "America/Mexico_City";

const partsFormatter = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string) {
  let f = partsFormatter.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    partsFormatter.set(tz, f);
  }
  return f;
}

/** Año, mes, día, hora y minuto locales de un instante en una zona. */
export function localParts(date: Date, tz: string) {
  const p = Object.fromEntries(formatter(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second) };
}

/** Diferencia (ms) entre la hora local de la zona y UTC en ese instante. */
function offsetMs(date: Date, tz: string): number {
  const l = localParts(date, tz);
  return Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, l.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** El instante de la medianoche local del día calendario `year-month-day` en la zona. */
function localMidnight(year: number, month: number, day: number, tz: string): Date {
  const guess = Date.UTC(year, month - 1, day);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz); // segunda pasada: cambios de horario
  return new Date(t);
}

/** Inicio (medianoche local) del día en que cae `date` en la zona `tz`. */
export function startOfLocalDay(date: Date, tz: string): Date {
  const l = localParts(date, tz);
  return localMidnight(l.year, l.month, l.day, tz);
}

/** Inicio del día local de hace `n` días (0 = hoy). */
export function daysAgoStart(n: number, tz: string, now: Date = new Date()): Date {
  const l = localParts(now, tz);
  return localMidnight(l.year, l.month, l.day - n, tz);
}

/** Hora local (0–23) de un instante. */
export function localHour(date: Date, tz: string): number {
  return localParts(date, tz).hour;
}

/** "YYYY-MM-DD" del día local de un instante. */
export function localDateString(date: Date, tz: string): string {
  const l = localParts(date, tz);
  return `${l.year}-${String(l.month).padStart(2, "0")}-${String(l.day).padStart(2, "0")}`;
}

/** Clave de día de los conteos diarios: la fecha local a las 00:00 UTC. */
export function dayKey(date: Date, tz: string): Date {
  const l = localParts(date, tz);
  return new Date(Date.UTC(l.year, l.month - 1, l.day));
}

/** Clave de día de un "YYYY-MM-DD" (fecha capturada a mano): la misma fecha a las 00:00 UTC. */
export function dayKeyFromString(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const key = new Date(Date.UTC(y, m - 1, d));
  if (key.getUTCFullYear() !== y || key.getUTCMonth() !== m - 1 || key.getUTCDate() !== d) throw new Error("Fecha inválida");
  return key;
}

/** Hace `n` días como clave de día. */
export function daysAgoKey(n: number, tz: string, now: Date = new Date()): Date {
  const k = dayKey(now, tz);
  k.setUTCDate(k.getUTCDate() - n);
  return k;
}

/** Zona horaria de la organización (con la de México como respaldo). */
export async function getOrgTimezone(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  return org?.timezone || DEFAULT_TIMEZONE;
}
