// Solo servidor. Utilidades compartidas por las páginas de Realty.

import type { RealtyOperation, RealtyPropertyType } from "@prisma/client";
import { resolvePeriod } from "@/lib/loyalty/period";
import { enumLabel, type RealtyDict } from "@/lib/i18n-realty";
import { formatMoney } from "@/lib/utils";

export type PeriodParams = { p?: string; from?: string; to?: string };

export function realtyPeriod(sp: PeriodParams, tz: string) {
  return resolvePeriod(sp, tz);
}

/** $4,250,000 (sin centavos). Para USD antepone "USD". */
export function priceText(amount: number, currency = "MXN"): string {
  const s = formatMoney(amount, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return currency === "MXN" ? s : `${currency} ${s}`;
}

/** $4.3M / $18k — para listas densas. */
export function compactPrice(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (amount >= 10_000) return `$${Math.round(amount / 1_000)}k`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `$${Math.round(amount)}`;
}

export function budgetText(min: number | null, max: number): string {
  return min ? `${compactPrice(min)}–${compactPrice(max)}` : `≤ ${compactPrice(max)}`;
}

export function typeOp(R: RealtyDict, type: RealtyPropertyType | null, op: RealtyOperation): string {
  return `${enumLabel(R, "type", type)} · ${enumLabel(R, "op", op)}`;
}

export function one<T extends string>(v: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
}
