import { getPlans } from "./plans";
import Stripe from "stripe";

let client: Stripe | null = null;

/** Null when STRIPE_SECRET_KEY isn't configured — callers must handle that (billing is optional). */
export function getStripeClient(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-08-26.dahlia" });
  }
  return client;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/**
 * Precio de Stripe de un plan: el que se captura en Admin → Planes y, si no hay, la variable de entorno STRIPE_PRICE_<LLAVE>
 * (p. ej. STRIPE_PRICE_PROFESSIONAL). Sin ninguno, ese plan no se cobra en línea.
 */
export async function stripePriceIdFor(plan: string): Promise<string | null> {
  const found = (await getPlans({ includeInactive: true })).find((p) => p.key === plan);
  return found?.stripePriceId || process.env[`STRIPE_PRICE_${plan.toUpperCase()}`] || null;
}

/** El plan al que corresponde un precio de Stripe (null si no es de ningún plan). */
export async function planForPriceId(priceId: string | null | undefined): Promise<string | null> {
  if (!priceId) return null;
  for (const p of await getPlans({ includeInactive: true })) {
    if ((p.stripePriceId || process.env[`STRIPE_PRICE_${p.key.toUpperCase()}`]) === priceId) return p.key;
  }
  return null;
}
