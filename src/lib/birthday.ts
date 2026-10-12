export type Birthday = { month: number; day: number };

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // febrero con 29: se acepta el 29 de febrero

/** Día y mes de nacimiento a partir de `{month, day}`, "MM-DD" o "YYYY-MM-DD" (el año se descarta: no se guarda). Null si no es una fecha válida. */
export function parseBirthday(raw: unknown): Birthday | null {
  let month: number;
  let day: number;
  if (typeof raw === "string") {
    const m = raw.trim().match(/^(?:\d{4}-)?(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    month = Number(m[1]);
    day = Number(m[2]);
  } else if (raw && typeof raw === "object") {
    month = Number((raw as Record<string, unknown>).month);
    day = Number((raw as Record<string, unknown>).day);
  } else return null;
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return null;
  return { month, day };
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** ¿Cumple años en la fecha local `YYYY-MM-DD`? Quien nació el 29 de febrero lo celebra el 28 en los años no bisiestos. */
export function isBirthdayOn(b: Birthday, localDate: string): boolean {
  const [y, m, d] = localDate.split("-").map(Number);
  if (b.month === m && b.day === d) return true;
  return b.month === 2 && b.day === 29 && !isLeap(y) && m === 2 && d === 28;
}

/** Condición de base de datos equivalente a `isBirthdayOn` para la fecha local `YYYY-MM-DD`. */
export function birthdayWhere(localDate: string): { OR: { birthMonth: number; birthDay: number }[] } {
  const [y, m, d] = localDate.split("-").map(Number);
  const or = [{ birthMonth: m, birthDay: d }];
  if (m === 2 && d === 28 && !isLeap(y)) or.push({ birthMonth: 2, birthDay: 29 });
  return { OR: or };
}

export const MONTH_NAMES = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
} as const;
