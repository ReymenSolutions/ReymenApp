import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Idioma de la interfaz → configuración regional de fechas y montos (por defecto español de México, como antes). */
export type UiLang = "es" | "en" | (string & {});
const localeOf = (lang?: UiLang) => (lang === "en" ? "en-US" : "es-MX");

export function formatDate(date: Date | string, lang?: UiLang) {
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

export function formatDateTime(date: Date | string, lang?: UiLang) {
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

/** Same as formatDateTime, but rendered in a specific IANA timezone (e.g. the organization's Agenda timezone) rather than the server's local time. */
export function formatDateTimeInTz(date: Date | string, timezone: string, lang?: UiLang) {
  return new Intl.DateTimeFormat(localeOf(lang), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(date));
}

/**
 * Monto en pesos con 2 decimales, p. ej. "$1,234.50" (el formato de Food).
 * Antes cada página de Food tenía su propia función money() igual.
 */
export function formatMoney(amount: number, options: Intl.NumberFormatOptions = {}) {
  return `$${amount.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2, ...options })}`;
}

export function formatCurrency(amount: number, currency: string = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function generateWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
