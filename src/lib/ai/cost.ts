import { Prisma } from "@prisma/client";
import type { AiRate } from "@prisma/client";
import type { NormalizedUsage } from "./types";

const MILLION = new Prisma.Decimal(1_000_000);

/**
 * Costo de una llamada en la moneda de la tarifa, con aritmética decimal (nunca flotantes). Caché y razonamiento sin
 * tarifa propia se cobran como entrada y salida respectivamente, que es lo que hacen los proveedores por defecto.
 */
export function computeCost(usage: NormalizedUsage, rate: Pick<AiRate, "inputPerMTok" | "outputPerMTok" | "cacheReadPerMTok" | "cacheWritePerMTok" | "reasoningPerMTok">): Prisma.Decimal {
  const part = (tokens: number, perMTok: Prisma.Decimal | null | undefined, fallback: Prisma.Decimal) => new Prisma.Decimal(tokens).mul(perMTok ?? fallback).div(MILLION);
  return part(usage.inputTokens, rate.inputPerMTok, rate.inputPerMTok)
    .add(part(usage.outputTokens, rate.outputPerMTok, rate.outputPerMTok))
    .add(part(usage.cacheReadTokens, rate.cacheReadPerMTok, rate.inputPerMTok))
    .add(part(usage.cacheWriteTokens, rate.cacheWritePerMTok, rate.inputPerMTok))
    .add(part(usage.reasoningTokens, rate.reasoningPerMTok, rate.outputPerMTok));
}

/** Convierte el costo a MXN. null = no hay forma de convertir (moneda desconocida o sin tipo de cambio): no se inventa. */
export function toMxn(cost: Prisma.Decimal, currency: string, mxnPerUsd: number | null): Prisma.Decimal | null {
  if (currency === "MXN") return cost;
  if (currency === "USD" && mxnPerUsd && mxnPerUsd > 0) return cost.mul(new Prisma.Decimal(mxnPerUsd));
  return null;
}
