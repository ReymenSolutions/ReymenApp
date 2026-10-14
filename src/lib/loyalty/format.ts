// Pure module — importable from client and server contexts.
// Formatos de Lealtad (dinero sin centavos en tableros, porcentajes, "hace 6 días").

import type { Lang } from "@/lib/i18n";
import { formatMoney } from "@/lib/utils";

export function money(n: number, cents = false): string {
  return formatMoney(n, cents ? {} : { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function pct(n: number | null, decimals = 1): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: decimals })}%`;
}

export function num(n: number, decimals = 0): string {
  return n.toLocaleString("es-MX", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** "hoy", "ayer", "hace 6 días" / "today", "yesterday", "6 days ago". */
export function relativeDay(date: Date | null, lang: Lang, now: Date = new Date()): string {
  if (!date) return "—";
  const days = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(lang === "en" ? "en-US" : "es-MX", { numeric: "auto" });
  if (days < 1) return rtf.format(0, "day");
  if (days < 30) return rtf.format(-days, "day");
  if (days < 365) return rtf.format(-Math.floor(days / 30), "month");
  return rtf.format(-Math.floor(days / 365), "year");
}

export function shortDate(date: Date | null, lang: Lang, timeZone?: string): string {
  if (!date) return "—";
  return date.toLocaleDateString(lang === "en" ? "en-US" : "es-MX", { day: "numeric", month: "short", year: "numeric", timeZone });
}

export function dateTime(date: Date, lang: Lang, timeZone?: string): string {
  return date.toLocaleString(lang === "en" ? "en-US" : "es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone });
}

/** +528112345678 → "+52 81 1234 5678" (otros formatos se muestran tal cual). */
export function formatPhone(e164: string): string {
  const m = e164.match(/^\+52(\d{2})(\d{4})(\d{4})$/);
  return m ? `+52 ${m[1]} ${m[2]} ${m[3]}` : e164;
}
