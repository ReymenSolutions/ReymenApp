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

/** Paid plans only — "starter" has no Stripe price, it's the default free/unbilled tier. */
export const PLAN_PRICE_ENV: Record<string, string | undefined> = {
  professional: process.env.STRIPE_PRICE_PROFESSIONAL,
  business: process.env.STRIPE_PRICE_BUSINESS,
};

export function planForPriceId(priceId: string | null | undefined): string | null {
  if (!priceId) return null;
  for (const [plan, id] of Object.entries(PLAN_PRICE_ENV)) {
    if (id && id === priceId) return plan;
  }
  return null;
}
