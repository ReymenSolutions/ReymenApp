import type { Customer } from "@prisma/client";
import type { ContactRules } from "./types";

export type PolicyInput = {
  customer: Customer | null;
  rules: ContactRules;
  now: Date;
  timezone: string;
  /** Último contacto (real o dry-run) de esta automatización con este cliente. */
  lastContactAt: Date | null;
};

export type PolicyResult = { ok: true } | { ok: false; reason: "no_customer" | "no_consent" | "cooldown" | "quiet_hours" };

/** Hora local (0–23) de `date` en la zona horaria IANA `timezone`. */
export function localHour(date: Date, timezone: string): number {
  const h = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(date);
  return Number(h) % 24;
}

export function inQuietHours(hour: number, q: { start: number; end: number }): boolean {
  if (q.start === q.end) return false;
  return q.start < q.end ? hour >= q.start && hour < q.end : hour >= q.start || hour < q.end;
}

/** Primer instante a partir de `from` (de hora en hora, hasta un día) que NO cae en horas de silencio. */
export function nextAllowedTime(from: Date, timezone: string, quiet: { start: number; end: number } | null | undefined): Date {
  if (!quiet) return from;
  let t = from;
  for (let i = 0; i < 24 && inQuietHours(localHour(t, timezone), quiet); i++) t = new Date(t.getTime() + 3_600_000);
  return t;
}

/**
 * Política de contacto única para todas las automatizaciones: solo se contacta a quien dio su
 * consentimiento, no antes de que termine el enfriamiento y no en horas de silencio.
 */
export function evaluateContactPolicy(input: PolicyInput): PolicyResult {
  const { customer, rules, now, timezone, lastContactAt } = input;
  if (!customer) return { ok: false, reason: "no_customer" };
  if (!customer.consentAccepted) return { ok: false, reason: "no_consent" };
  if (lastContactAt && rules.cooldownDays > 0 && now.getTime() - lastContactAt.getTime() < rules.cooldownDays * 86_400_000) {
    return { ok: false, reason: "cooldown" };
  }
  if (rules.quietHours && inQuietHours(localHour(now, timezone), rules.quietHours)) return { ok: false, reason: "quiet_hours" };
  return { ok: true };
}
